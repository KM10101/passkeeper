#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod error;
mod state;
mod db;
mod crypto;
mod commands;

use state::AppState;
use db::init_db;

fn main() {
    let db_path = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("passkeeper")
        .join("vault.db");
    std::fs::create_dir_all(db_path.parent().unwrap()).unwrap();
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    init_db(&conn).unwrap();
    let app_state = AppState::new(conn, db_path);

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
            commands::entries::list_entries,
            commands::entries::get_entry,
            commands::entries::create_entry,
            commands::entries::update_entry,
            commands::entries::delete_entry,
            commands::metadata::fetch_site_metadata,
            commands::metadata::get_favicon,
            commands::vault_io::export_vault,
            commands::vault_io::import_vault,
            commands::vault_io::export_vault_to_path,
            commands::vault_io::import_vault_from_path,
            commands::settings::get_settings,
            commands::settings::update_settings,
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
