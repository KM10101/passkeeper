use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};
use rand::rngs::OsRng;
use rand::RngCore;
use crate::error::{AppError, AppResult};

pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> AppResult<(Vec<u8>, [u8; 12])> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext)
        .map_err(|e| AppError::Crypto(e.to_string()))?;
    Ok((ciphertext, nonce_bytes))
}

pub fn decrypt(key: &[u8; 32], ciphertext: &[u8], nonce: &[u8; 12]) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce);
    cipher.decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Crypto("decryption failed".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::kdf::derive_key;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = [0u8; 32];
        let plaintext = b"super secret password";
        let (ciphertext, nonce) = encrypt(&key, plaintext).unwrap();
        let decrypted = decrypt(&key, &ciphertext, &nonce).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn wrong_key_returns_error() {
        let key1 = [0u8; 32];
        let key2 = [1u8; 32];
        let plaintext = b"data";
        let (ciphertext, nonce) = encrypt(&key1, plaintext).unwrap();
        let result = decrypt(&key2, &ciphertext, &nonce);
        assert!(result.is_err());
    }

    #[test]
    fn derive_key_is_deterministic() {
        let salt = [42u8; 16];
        let k1 = derive_key("password", &salt).unwrap();
        let k2 = derive_key("password", &salt).unwrap();
        assert_eq!(k1, k2);
    }

    #[test]
    fn derive_key_different_passwords_differ() {
        let salt = [0u8; 16];
        let k1 = derive_key("password1", &salt).unwrap();
        let k2 = derive_key("password2", &salt).unwrap();
        assert_ne!(k1, k2);
    }
}
