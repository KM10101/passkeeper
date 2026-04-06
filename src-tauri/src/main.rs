#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod error;
mod state;
mod db;
mod crypto;
mod commands;

use state::AppState;
use db::init_db;

fn get_default_db_path() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("passkeeper")
        .join("vault.db")
}

fn main() {
    let default_path = get_default_db_path();
    std::fs::create_dir_all(default_path.parent().unwrap()).unwrap();

    // Open default DB first to read storage_dir config
    let default_conn = rusqlite::Connection::open(&default_path).unwrap();
    init_db(&default_conn).unwrap();

    let storage_dir: Option<String> = default_conn.query_row(
        "SELECT value FROM app_config WHERE key='storage_dir'",
        [], |r| r.get::<_, String>(0),
    ).ok().filter(|s| !s.is_empty());

    let (active_conn, db_path) = if let Some(ref dir) = storage_dir {
        let custom_path = std::path::PathBuf::from(dir).join("vault.db");
        std::fs::create_dir_all(dir).unwrap();
        let custom_conn = rusqlite::Connection::open(&custom_path).unwrap();
        init_db(&custom_conn).unwrap();
        drop(default_conn);
        (custom_conn, custom_path)
    } else {
        (default_conn, default_path)
    };

    let app_state = AppState::new(active_conn, db_path);

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::auth::unlock,
            commands::auth::lock,
            commands::auth::is_locked,
            commands::auth::change_master_password,
            commands::groups::list_groups,
            commands::groups::create_group,
            commands::groups::update_group,
            commands::groups::delete_group,
            commands::groups::toggle_group_pin,
            commands::groups::reorder_groups,
            commands::entries::list_entries,
            commands::entries::get_entry,
            commands::entries::create_entry,
            commands::entries::update_entry,
            commands::entries::delete_entry,
            commands::entries::pin_entry,
            commands::entries::reorder_entries,
            commands::metadata::fetch_site_metadata,
            commands::metadata::get_favicon,
            commands::vault_io::export_vault,
            commands::vault_io::import_vault,
            commands::vault_io::export_vault_to_path,
            commands::vault_io::import_vault_from_path,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_storage_dir,
            commands::settings::migrate_storage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn all_modules_compile() {
        assert!(true);
    }
}
