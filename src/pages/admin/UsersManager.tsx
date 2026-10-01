// UsersManager - admin users list + role/permission editing.
// Full grid UI lives in UsersRolesManager (calls GET/POST/PATCH/DELETE /api/admin/users
// with role + permissions[] validated against server VALID_PERMS).
// This module is the canonical /admin/users route target.
export { default } from './UsersRolesManager';
export { default as UsersManager } from './UsersRolesManager';
