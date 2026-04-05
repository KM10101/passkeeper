use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "type")]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),
    #[error("Crypto error: {0}")]
    Crypto(String),
    #[error("Vault is locked")]
    Locked,
    #[error("Record not found")]
    NotFound,
    #[error("同分组下已存在同名条目")]
    DuplicateTitle,
    #[error("Invalid master password")]
    InvalidPassword,
    #[error("IO error: {0}")]
    Io(String),
    #[error("{0}")]
    Other(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self { AppError::Database(e.to_string()) }
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { AppError::Io(e.to_string()) }
}
impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self { AppError::Other(e.to_string()) }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_serializes_to_json() {
        let err = AppError::Locked;
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("Locked"));
    }

    #[test]
    fn app_error_invalid_password_display() {
        let err = AppError::InvalidPassword;
        let s = format!("{}", err);
        assert!(!s.is_empty());
    }
}
