use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATABASE_URL: &str = "sqlite:nodi.db";

const INITIAL_SCHEMA: &str = include_str!("../migrations/0001_initial_schema.sql");

pub fn all() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initial schema",
        sql: INITIAL_SCHEMA,
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::Path,
        time::{SystemTime, UNIX_EPOCH},
    };

    use sqlx::{migrate::Migrator, sqlite::SqlitePoolOptions};

    async fn migration_runner() -> Migrator {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
        Migrator::new(path.as_path())
            .await
            .expect("migration files should be valid")
    }

    #[tokio::test]
    async fn fresh_database_gets_the_core_schema_exactly_once() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        let runner = migration_runner().await;

        runner
            .run(&pool)
            .await
            .expect("first migration run should succeed");
        runner
            .run(&pool)
            .await
            .expect("second migration run should be a no-op");

        let tables = sqlx::query_scalar::<_, String>(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .expect("schema should be readable");

        for expected in [
            "attachments",
            "note_tags",
            "notebook_stacks",
            "notebooks",
            "notes",
            "settings",
            "shortcuts",
            "tags",
        ] {
            assert!(tables.iter().any(|table| table == expected));
        }

        let applied_count =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations WHERE success = 1")
                .fetch_one(&pool)
                .await
                .expect("migration history should be readable");

        assert_eq!(applied_count, 1);
    }

    #[tokio::test]
    async fn failed_migration_rolls_back_and_is_not_recorded() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "nodi-failed-migration-{}-{unique}",
            std::process::id()
        ));

        fs::create_dir(&path).expect("temporary migration directory should be created");
        fs::write(
            path.join("0001_broken.sql"),
            "CREATE TABLE partial_data (id TEXT PRIMARY KEY); THIS IS NOT SQL;",
        )
        .expect("broken migration fixture should be written");

        let runner = Migrator::new(path.as_path())
            .await
            .expect("broken SQL should still be a discoverable migration");
        let result = runner.run(&pool).await;

        assert!(result.is_err());

        let partial_table_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'partial_data'",
        )
        .fetch_one(&pool)
        .await
        .expect("schema should remain readable");
        let applied_count =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations WHERE success = 1")
                .fetch_one(&pool)
                .await
                .expect("migration history should remain readable");

        assert_eq!(partial_table_count, 0);
        assert_eq!(applied_count, 0);

        fs::remove_dir_all(&path).expect("temporary migration directory should be removed");
    }
}
