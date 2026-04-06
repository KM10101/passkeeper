use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Group {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub icon: Option<String>,
    pub sort_order: i64,
    pub is_pinned: bool,
    pub created_at: i64,
    pub entry_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Entry {
    pub id: i64,
    pub group_id: Option<i64>,
    pub title: String,
    pub url: Option<String>,
    pub site_title: Option<String>,
    pub username: Option<String>,
    pub template_type: String,
    pub tags: String, // JSON array string e.g. '["work","dev"]'
    pub notes: Option<String>,
    pub favorite: bool,
    pub pinned: bool,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EntryField {
    pub id: i64,
    pub entry_id: i64,
    pub field_name: String,
    pub field_type: String,
    pub field_value: Vec<u8>,
    pub nonce: Option<Vec<u8>>,
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub key: String,
    pub value: String,
}
