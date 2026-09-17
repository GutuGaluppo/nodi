use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATABASE_URL: &str = "sqlite:nodi.db";

const INITIAL_SCHEMA: &str = include_str!("../migrations/0001_initial_schema.sql");
const SEARCH_CLEANUP: &str = include_str!("../migrations/0002_search_cleanup.sql");
const NOTEBOOK_STACK_CLEANUP: &str = include_str!("../migrations/0003_notebook_stack_cleanup.sql");
const SHORTCUT_INTEGRITY: &str = include_str!("../migrations/0004_shortcut_integrity.sql");
const FTS_SYNC: &str = include_str!("../migrations/0005_fts_sync.sql");
const SAVED_SEARCHES: &str = include_str!("../migrations/0006_saved_searches.sql");
const PRIVATE_NOTES: &str = include_str!("../migrations/0007_private_notes.sql");

pub fn all() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: INITIAL_SCHEMA,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "search cleanup",
            sql: SEARCH_CLEANUP,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "notebook stack cleanup",
            sql: NOTEBOOK_STACK_CLEANUP,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "shortcut integrity",
            sql: SHORTCUT_INTEGRITY,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "fts sync",
            sql: FTS_SYNC,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "saved searches",
            sql: SAVED_SEARCHES,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "private notes",
            sql: PRIVATE_NOTES,
            kind: MigrationKind::Up,
        },
    ]
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
            "notes_fts",
            "saved_searches",
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

        assert_eq!(applied_count, 7);
    }

    #[tokio::test]
    async fn permanently_deleting_a_note_cascades_related_rows_and_search() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .expect("foreign keys should be enabled");
        migration_runner()
            .await
            .run(&pool)
            .await
            .expect("migrations should succeed");

        sqlx::query(
            "INSERT INTO notes (id, content_json, created_at, updated_at, device_id) VALUES ('n1', '{}', 'now', 'now', 'd1')",
        )
        .execute(&pool)
        .await
        .expect("note fixture should be inserted");
        sqlx::query(
            "INSERT INTO attachments (id, note_id, filename, relative_path, sha256, size, created_at) VALUES ('a1', 'n1', 'file.txt', 'attachments/file.txt', 'hash', 1, 'now')",
        )
        .execute(&pool)
        .await
        .expect("attachment fixture should be inserted");
        sqlx::query(
            "INSERT INTO tags (id, name, created_at, updated_at) VALUES ('t1', 'tag', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .expect("tag fixture should be inserted");
        sqlx::query("INSERT INTO note_tags (note_id, tag_id) VALUES ('n1', 't1')")
            .execute(&pool)
            .await
            .expect("note tag fixture should be inserted");
        sqlx::query("INSERT INTO notes_fts (note_id, title) VALUES ('n1', 'Note')")
            .execute(&pool)
            .await
            .expect("search fixture should be inserted");
        sqlx::query(
            "INSERT INTO shortcuts (id, target_type, target_id, sort_order, created_at) VALUES ('sc1', 'note', 'n1', 0, 'now')",
        )
        .execute(&pool)
        .await
        .expect("shortcut fixture should be inserted");

        sqlx::query("DELETE FROM notes WHERE id = 'n1'")
            .execute(&pool)
            .await
            .expect("note should be deleted");

        for table in [
            "notes",
            "attachments",
            "note_tags",
            "notes_fts",
            "shortcuts",
        ] {
            let count = sqlx::query_scalar::<_, i64>(&format!(
                "SELECT COUNT(*) FROM {table} WHERE {} = 'n1'",
                if table == "shortcuts" {
                    "target_id"
                } else if table == "attachments" || table == "note_tags" || table == "notes_fts" {
                    "note_id"
                } else {
                    "id"
                }
            ))
            .fetch_one(&pool)
            .await
            .expect("related table should be readable");
            assert_eq!(count, 0, "{table} should not retain note data");
        }
    }

    #[tokio::test]
    async fn deleting_a_stack_keeps_its_notebooks_and_unlinks_them() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        migration_runner()
            .await
            .run(&pool)
            .await
            .expect("migrations should succeed");

        sqlx::query(
            "INSERT INTO notebook_stacks (id, name, created_at, updated_at) VALUES ('s1', 'Work', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .expect("stack fixture should be inserted");
        sqlx::query(
            "INSERT INTO notebooks (id, name, stack_id, created_at, updated_at) VALUES ('nb1', 'Projects', 's1', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .expect("notebook fixture should be inserted");

        sqlx::query("DELETE FROM notebook_stacks WHERE id = 's1'")
            .execute(&pool)
            .await
            .expect("stack should be deleted");

        let stack_id = sqlx::query_scalar::<_, Option<String>>(
            "SELECT stack_id FROM notebooks WHERE id = 'nb1'",
        )
        .fetch_one(&pool)
        .await
        .expect("notebook should remain readable");
        assert_eq!(stack_id, None);
    }

    #[tokio::test]
    async fn full_text_projection_tracks_note_tag_and_notebook_text() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        migration_runner()
            .await
            .run(&pool)
            .await
            .expect("migrations should succeed");

        sqlx::query(
            "INSERT INTO notebooks (id, name, created_at, updated_at) VALUES ('nb1', 'Projects', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .expect("notebook fixture should be inserted");
        sqlx::query(
            "INSERT INTO notes (id, title, content_json, content_text, notebook_id, created_at, updated_at, device_id) VALUES ('n1', 'Roadmap', '{}', 'shipping plan', 'nb1', 'now', 'now', 'd1')",
        )
        .execute(&pool)
        .await
        .expect("note fixture should be inserted");
        sqlx::query(
            "INSERT INTO tags (id, name, created_at, updated_at) VALUES ('t1', 'ideas', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .expect("tag fixture should be inserted");
        sqlx::query("INSERT INTO note_tags (note_id, tag_id) VALUES ('n1', 't1')")
            .execute(&pool)
            .await
            .expect("note tag fixture should be inserted");

        let projection = sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT title, content_text, tags_text, notebook_text FROM notes_fts WHERE note_id = 'n1'",
        )
        .fetch_one(&pool)
        .await
        .expect("search projection should exist");
        assert_eq!(
            projection,
            (
                "Roadmap".into(),
                "shipping plan".into(),
                "ideas".into(),
                "Projects".into()
            )
        );

        sqlx::query("UPDATE tags SET name = 'research' WHERE id = 't1'")
            .execute(&pool)
            .await
            .expect("tag should rename");
        sqlx::query("UPDATE notebooks SET name = 'Studio' WHERE id = 'nb1'")
            .execute(&pool)
            .await
            .expect("notebook should rename");
        let updated = sqlx::query_as::<_, (String, String)>(
            "SELECT tags_text, notebook_text FROM notes_fts WHERE note_id = 'n1'",
        )
        .fetch_one(&pool)
        .await
        .expect("search projection should update");
        assert_eq!(updated, ("research".into(), "Studio".into()));
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
