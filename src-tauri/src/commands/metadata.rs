use tauri::State;
use serde::Serialize;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::commands::settings::get_settings_inner;

#[derive(Debug, Serialize)]
pub struct SiteMetadata {
    pub title: Option<String>,
    pub favicon_domain: Option<String>,
}

fn build_http_client(state: &AppState) -> reqwest::Client {
    let settings = get_settings_inner(state).ok();
    let http_proxy = settings.as_ref().map(|s| s.http_proxy.as_str()).unwrap_or("").to_string();
    let no_proxy_str = settings.as_ref().map(|s| s.no_proxy.as_str()).unwrap_or("").to_string();

    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10));

    if !http_proxy.is_empty() {
        if let Ok(mut proxy) = reqwest::Proxy::all(&http_proxy) {
            if !no_proxy_str.is_empty() {
                proxy = proxy.no_proxy(reqwest::NoProxy::from_string(&no_proxy_str));
            }
            builder = builder.proxy(proxy);
        }
    }

    builder.build().unwrap_or_else(|_| reqwest::Client::new())
}

fn favicon_is_expired(state: &AppState, domain: &str) -> bool {
    let expiry_days = get_settings_inner(state)
        .map(|s| s.favicon_cache_expiry_days)
        .unwrap_or(7);
    let db = state.db.lock().unwrap();
    let fetched_at: Option<String> = db.query_row(
        "SELECT fetched_at FROM favicon_cache WHERE domain=?1",
        [domain], |r| r.get(0),
    ).ok();
    match fetched_at {
        None => true,
        Some(ts) => {
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&ts, "%Y-%m-%d %H:%M:%S") {
                let age = chrono::Utc::now().naive_utc() - dt;
                age.num_days() >= expiry_days
            } else {
                true
            }
        }
    }
}

pub fn get_favicon_inner(domain: &str, state: &AppState) -> AppResult<Option<Vec<u8>>> {
    let db = state.db.lock().unwrap();
    let result: Option<Vec<u8>> = db.query_row(
        "SELECT data FROM favicon_cache WHERE domain=?1",
        [domain], |r| r.get(0),
    ).ok();
    Ok(result)
}

pub fn store_favicon_inner(domain: &str, data: &[u8], state: &AppState) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO favicon_cache(domain, data, fetched_at) VALUES(?1, ?2, datetime('now'))",
        rusqlite::params![domain, data],
    )?;
    Ok(())
}

pub async fn fetch_site_metadata_inner(url: &str, state: &AppState) -> AppResult<SiteMetadata> {
    let domain = extract_domain(url);
    let client = build_http_client(state);
    let mut title: Option<String> = None;
    let mut favicon_domain: Option<String> = None;

    if let Ok(resp) = client.get(url).send().await {
        if let Ok(html) = resp.text().await {
            let doc = scraper::Html::parse_document(&html);
            let sel = scraper::Selector::parse("title").unwrap();
            title = doc.select(&sel).next().map(|e| e.inner_html().trim().to_string());
        }
    }

    if let Some(ref d) = domain {
        if favicon_is_expired(state, d) {
            let favicon_url = format!("https://{}/favicon.ico", d);
            if let Ok(resp) = client.get(&favicon_url).send().await {
                if resp.status().is_success() {
                    if let Ok(bytes) = resp.bytes().await {
                        let data: Vec<u8> = bytes.to_vec();
                        if !data.is_empty() {
                            let _ = store_favicon_inner(d, &data, state);
                        }
                    }
                }
            }
        }
        favicon_domain = Some(d.clone());
    }

    Ok(SiteMetadata { title, favicon_domain })
}

fn extract_domain(url: &str) -> Option<String> {
    url.split("://").nth(1)
        .and_then(|s| s.split('/').next())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn fetch_site_metadata(
    url: String, state: State<'_, AppState>,
) -> Result<SiteMetadata, AppError> {
    fetch_site_metadata_inner(&url, &state).await
}

#[tauri::command]
pub async fn get_favicon(
    domain: String, state: State<'_, AppState>,
) -> Result<Option<Vec<u8>>, AppError> {
    get_favicon_inner(&domain, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::state::AppState;
    use crate::db::init_db;

    fn make_state() -> AppState {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        AppState::new(conn, std::path::PathBuf::new())
    }

    #[test]
    fn get_favicon_returns_none_when_not_cached() {
        let state = make_state();
        assert!(get_favicon_inner("example.com", &state).unwrap().is_none());
    }

    #[test]
    fn store_and_retrieve_favicon() {
        let state = make_state();
        let data = vec![1u8, 2, 3, 4];
        store_favicon_inner("example.com", &data, &state).unwrap();
        assert_eq!(get_favicon_inner("example.com", &state).unwrap(), Some(data));
    }

    #[test]
    fn favicon_is_expired_when_not_cached() {
        let state = make_state();
        assert!(favicon_is_expired(&state, "new.com"));
    }

    #[test]
    fn favicon_not_expired_immediately_after_store() {
        let state = make_state();
        store_favicon_inner("fresh.com", &[1, 2, 3], &state).unwrap();
        assert!(!favicon_is_expired(&state, "fresh.com"));
    }
}
