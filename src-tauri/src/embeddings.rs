//! On-device sentence embeddings for related notes (REL-001), using Apple's
//! NaturalLanguage framework. Vectors are computed in this process; nothing
//! leaves the Mac. Vectors from different languages are not comparable, so each
//! carries the language it was computed in.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct EmbeddingInput {
    pub id: String,
    pub text: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingResult {
    pub id: String,
    /// BCP-47 code, or `None` when the language has no sentence embedding.
    pub language: Option<String>,
    pub vector: Vec<f32>,
}

/// Longest text embedded per note; a sentence embedding summarizes meaning,
/// and the start of a note carries most of it.
const MAX_CHARS: usize = 1_000;

#[cfg(target_os = "macos")]
pub fn embed_all(inputs: &[EmbeddingInput]) -> Vec<EmbeddingResult> {
    use objc2::rc::{autoreleasepool, Retained};
    use objc2_foundation::NSString;
    use objc2_natural_language::{NLEmbedding, NLLanguageRecognizer};

    // Loading a language's embedding is the expensive part; do it once.
    let mut models: HashMap<String, Option<Retained<NLEmbedding>>> = HashMap::new();
    inputs
        .iter()
        .map(|input| {
            let text: String = input.text.chars().take(MAX_CHARS).collect();
            autoreleasepool(|_| {
                let string = NSString::from_str(&text);
                // SAFETY: plain calls on valid NSString arguments.
                let language = unsafe { NLLanguageRecognizer::dominantLanguageForString(&string) };
                let Some(language) = language else {
                    return EmbeddingResult {
                        id: input.id.clone(),
                        language: None,
                        vector: Vec::new(),
                    };
                };
                let code = language.to_string();
                let model = models.entry(code.clone()).or_insert_with(|| unsafe {
                    NLEmbedding::sentenceEmbeddingForLanguage(&language)
                });
                let vector: Vec<f32> = model
                    .as_ref()
                    .and_then(|model| unsafe { model.vectorForString(&string) })
                    .map(|numbers| numbers.iter().map(|n| n.as_f64() as f32).collect())
                    .unwrap_or_default();
                EmbeddingResult {
                    id: input.id.clone(),
                    language: if vector.is_empty() { None } else { Some(code) },
                    vector,
                }
            })
        })
        .collect()
}

#[cfg(not(target_os = "macos"))]
pub fn embed_all(inputs: &[EmbeddingInput]) -> Vec<EmbeddingResult> {
    inputs
        .iter()
        .map(|input| EmbeddingResult {
            id: input.id.clone(),
            language: None,
            vector: Vec::new(),
        })
        .collect()
}

#[tauri::command]
pub async fn embed_notes(inputs: Vec<EmbeddingInput>) -> Result<Vec<EmbeddingResult>, String> {
    tauri::async_runtime::spawn_blocking(move || embed_all(&inputs))
        .await
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cosine(a: &[f32], b: &[f32]) -> f32 {
        let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
        let norm = |v: &[f32]| v.iter().map(|x| x * x).sum::<f32>().sqrt();
        dot / (norm(a) * norm(b))
    }

    fn input(id: &str, text: &str) -> EmbeddingInput {
        EmbeddingInput {
            id: id.into(),
            text: text.into(),
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn similar_sentences_are_closer_than_unrelated_ones() {
        let results = embed_all(&[
            input("cat", "The cat is sleeping on the warm sofa."),
            input("kitten", "A kitten naps on the cozy couch."),
            input("tax", "The quarterly tax filing is due on Friday."),
        ]);

        assert!(
            results.iter().all(|r| r.language.as_deref() == Some("en")),
            "{results:?}"
        );
        let cat_kitten = cosine(&results[0].vector, &results[1].vector);
        let cat_tax = cosine(&results[0].vector, &results[2].vector);
        assert!(
            cat_kitten > cat_tax,
            "cat/kitten {cat_kitten} vs cat/tax {cat_tax}"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn detects_portuguese_and_embeds_it_separately() {
        let results = embed_all(&[input(
            "pt",
            "Preciso comprar pão e leite para o café da manhã.",
        )]);
        assert_eq!(results[0].language.as_deref(), Some("pt"));
        assert!(!results[0].vector.is_empty());
    }

    #[test]
    fn gives_up_gracefully_on_text_without_language() {
        let results = embed_all(&[input("empty", "")]);
        assert!(results[0].vector.is_empty());
        assert_eq!(results[0].language, None);
    }
}
