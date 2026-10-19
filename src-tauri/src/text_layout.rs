//! Lays recognized lines out as text (OCR-003).
//!
//! Readers return lines in reading order, but a column of prices or a word
//! written off to the side comes back as a line of its own. Lines at the same
//! height that do not overlap sideways are joined into one row, left to right.
//! Rows then form blocks: by the reader's paragraphs when it has them, or by
//! the vertical gaps between rows. Blocks are separated by a blank line, and
//! a row that starts with a bullet or an arrow becomes a `- ` list item.

use serde::Deserialize;

/// One recognized line. Coordinates are normalized, origin bottom-left.
#[derive(Debug, Clone, Deserialize)]
pub struct Line {
    pub text: String,
    /// The paragraph the reader put the line in, when it groups paragraphs.
    pub paragraph: Option<usize>,
    pub top: f64,
    pub bottom: f64,
    pub left: f64,
    pub right: f64,
}

impl Line {
    fn height(&self) -> f64 {
        (self.top - self.bottom).max(0.0)
    }
}

/// How much of the shorter one two lines must share vertically to be a row.
const SAME_ROW_OVERLAP: f64 = 0.6;
/// A gap taller than this share of a typical line starts a new block.
const BLOCK_GAP: f64 = 0.6;

const LIST_MARKERS: &[char] = &[
    '•', '·', '●', '◦', '▪', '-', '–', '—', '*', '↳', '→', '➔', '➜', '>',
];

struct Row<'a> {
    lines: Vec<&'a Line>,
    top: f64,
    bottom: f64,
}

impl<'a> Row<'a> {
    fn new(line: &'a Line) -> Self {
        Row {
            lines: vec![line],
            top: line.top,
            bottom: line.bottom,
        }
    }

    fn accepts(&self, line: &Line) -> bool {
        let shared = self.top.min(line.top) - self.bottom.max(line.bottom);
        let shorter = (self.top - self.bottom).min(line.height());
        shorter > 0.0
            && shared >= SAME_ROW_OVERLAP * shorter
            && self
                .lines
                .iter()
                .all(|other| line.left >= other.right || line.right <= other.left)
    }

    fn add(&mut self, line: &'a Line) {
        self.lines.push(line);
        self.top = self.top.max(line.top);
        self.bottom = self.bottom.min(line.bottom);
    }

    fn shares_paragraph(&self, other: &Row) -> bool {
        self.lines.iter().any(|line| {
            line.paragraph.is_some()
                && other
                    .lines
                    .iter()
                    .any(|theirs| theirs.paragraph == line.paragraph)
        })
    }

    fn text(&self) -> String {
        let mut lines = self.lines.clone();
        lines.sort_by(|a, b| a.left.total_cmp(&b.left));
        let joined = lines
            .iter()
            .map(|line| line.text.split_whitespace().collect::<Vec<_>>().join(" "))
            .collect::<Vec<_>>()
            .join(" ");
        as_list_item(&joined)
    }
}

/// `•fechar` → `- fechar`. A marker before a number (`-5 °C`) is kept.
fn as_list_item(row: &str) -> String {
    let mut chars = row.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    if !LIST_MARKERS.contains(&first) {
        return row.to_string();
    }
    let rest = chars.as_str().trim_start();
    match rest.chars().next() {
        Some(next) if next.is_alphabetic() || next == '"' || next == '“' => format!("- {rest}"),
        _ => row.to_string(),
    }
}

fn median_height(lines: &[Line]) -> f64 {
    let mut heights: Vec<f64> = lines.iter().map(Line::height).collect();
    heights.sort_by(f64::total_cmp);
    heights.get(heights.len() / 2).copied().unwrap_or(0.0)
}

pub fn layout(lines: &[Line]) -> String {
    let lines: Vec<Line> = lines
        .iter()
        .filter(|line| !line.text.trim().is_empty())
        .cloned()
        .collect();
    let by_paragraph = lines.iter().any(|line| line.paragraph.is_some());
    let mut ordered: Vec<&Line> = lines.iter().collect();
    if !by_paragraph {
        ordered.sort_by(|a, b| b.top.total_cmp(&a.top));
    }

    let mut rows: Vec<Row> = Vec::new();
    for line in ordered {
        match rows.iter_mut().find(|row| row.accepts(line)) {
            Some(row) => row.add(line),
            None => rows.push(Row::new(line)),
        }
    }

    let gap = BLOCK_GAP * median_height(&lines);
    let mut text = String::new();
    for (index, row) in rows.iter().enumerate() {
        if index > 0 {
            let previous = &rows[index - 1];
            let new_block = if by_paragraph {
                !row.shares_paragraph(previous)
            } else {
                previous.bottom - row.top > gap
            };
            text.push_str(if new_block { "\n\n" } else { "\n" });
        }
        text.push_str(&row.text());
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(
        text: &str,
        paragraph: Option<usize>,
        top: f64,
        bottom: f64,
        left: f64,
        right: f64,
    ) -> Line {
        Line {
            text: text.into(),
            paragraph,
            top,
            bottom,
            left,
            right,
        }
    }

    #[test]
    fn joins_a_price_column_to_its_items() {
        // As Vision's document reader returns a receipt: items, then prices.
        let lines = [
            line("LISBON BAKERY", Some(0), 0.929, 0.838, 0.063, 0.613),
            line("2x Pastel de nata", Some(1), 0.595, 0.529, 0.062, 0.428),
            line("Espresso", Some(2), 0.472, 0.395, 0.064, 0.263),
            line("TOTAL", Some(3), 0.177, 0.085, 0.059, 0.288),
            line("3.20", Some(4), 0.595, 0.514, 0.744, 0.847),
            line("1.20", Some(5), 0.476, 0.395, 0.744, 0.847),
            line("12.40", Some(6), 0.187, 0.071, 0.715, 0.894),
        ];

        assert_eq!(
            layout(&lines),
            "LISBON BAKERY\n\n2x Pastel de nata 3.20\n\nEspresso 1.20\n\nTOTAL 12.40"
        );
    }

    #[test]
    fn keeps_handwritten_paragraphs_and_side_notes() {
        // Handwriting boxes overlap vertically; stacked lines stay apart.
        let lines = [
            line("Cadence - audio", Some(0), 0.968, 0.896, 0.232, 0.679),
            line("click do botão", Some(0), 0.912, 0.812, 0.285, 0.759),
            line("•fechar app somente", Some(1), 0.825, 0.699, 0.254, 0.842),
            line("com \"Quit\"", Some(1), 0.747, 0.673, 0.276, 0.598),
            line("Close", Some(2), 0.740, 0.692, 0.638, 0.787),
            line("mantém app na barra", Some(3), 0.676, 0.601, 0.260, 0.782),
            line("de menus.", Some(3), 0.606, 0.542, 0.274, 0.537),
        ];

        assert_eq!(
            layout(&lines),
            "Cadence - audio\nclick do botão\n\n- fechar app somente\ncom \"Quit\" Close\n\nmantém app na barra\nde menus."
        );
    }

    #[test]
    fn infers_blocks_from_gaps_without_paragraphs() {
        let lines = [
            line("Lista", None, 0.90, 0.85, 0.1, 0.3),
            line("→ leite", None, 0.84, 0.79, 0.1, 0.3),
            line("-5 graus", None, 0.78, 0.73, 0.1, 0.3),
            line("Depois", None, 0.50, 0.45, 0.1, 0.3),
        ];

        assert_eq!(layout(&lines), "Lista\n- leite\n-5 graus\n\nDepois");
    }

    #[test]
    fn handles_no_lines() {
        assert_eq!(layout(&[]), "");
        assert_eq!(layout(&[line("  ", None, 0.5, 0.4, 0.1, 0.2)]), "");
    }
}
