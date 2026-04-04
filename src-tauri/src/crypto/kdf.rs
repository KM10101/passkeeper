use argon2::{Argon2, Algorithm, Version, Params};
use crate::error::{AppError, AppResult};

pub fn derive_key(password: &str, salt: &[u8]) -> AppResult<[u8; 32]> {
    let params = Params::new(65536, 3, 4, Some(32))
        .map_err(|e| AppError::Crypto(e.to_string()))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2.hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::Crypto(e.to_string()))?;
    Ok(key)
}
