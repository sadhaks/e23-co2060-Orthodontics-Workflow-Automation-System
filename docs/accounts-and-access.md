# Accounts, Sign-In, and Access

This guide explains how OrthoFlow user accounts are created, how users sign in, how passwords and sessions work, and why different users see different parts of the system.

## Account Model

OrthoFlow has no public registration page. Every user must already have an OrthoFlow account before using either email/password login or Google Sign-In.

The available roles are:

- Administrator (`ADMIN`)
- Orthodontist (`ORTHODONTIST`)
- Dental Surgeon (`DENTAL_SURGEON`)
- Nurse (`NURSE`)
- Receptionist (`RECEPTION`)
- Student (`STUDENT`)

Role controls which pages appear in the sidebar and which actions the backend accepts. Orthodontists, dental surgeons, and students are also restricted to patients actively assigned to them.

## How an Administrator Creates a User

1. Sign in as an Administrator.
2. Open **User Management**.
3. Select **Add User**.
4. Enter the user's name and email address.
5. Select the department or division.
6. Select one role.
7. Select **Create User**.

The browser interface does not ask the administrator to invent a password. The backend generates a secure temporary password, hashes it before database storage, creates the account as active, and sends the temporary password to the user's email address.

The account is created before the background email operation finishes. Administrators should confirm that outbound email is configured and monitor backend logs if the user does not receive the message.

## First Sign-In

1. Open the OrthoFlow login page.
2. Enter the account email and temporary password.
3. After successful authentication, OrthoFlow redirects the user to **Settings**.
4. Enter the temporary password as the current password.
5. Enter and confirm a new password.
6. Select **Update Password**.

Until this change is completed, the frontend keeps the user on Settings and the backend rejects access to other protected features.

The new password must:

- contain at least eight characters;
- contain at least one uppercase letter;
- contain at least one lowercase letter; and
- contain at least one number.

The new password must also differ from the current password. After a successful change, all refresh tokens are revoked and the user must sign in again.

## Email and Password Sign-In

Email/password login accepts only active accounts. The system returns the same general error for an unknown email and an incorrect password so that it does not reveal whether an account exists.

The login endpoints are rate-limited by IP address. The default limit is five attempts in a 15-minute window unless the deployment overrides the rate-limit environment variables.

## Google Sign-In

Google Sign-In is an alternative authentication method, not an account-creation method.

For Google Sign-In to succeed:

- the Google button must be configured in the frontend;
- the backend must trust the Google OAuth client ID;
- Google must return a valid, unexpired token for a verified email address;
- the Google email must correspond to an existing OrthoFlow user email; and
- the matching OrthoFlow account must be active.

If no OrthoFlow account exists for that email, access is refused. Google Sign-In does not automatically assign a role or create a user.

## Sessions and Sign-Out

After login, the frontend stores an access token and refresh token in browser local storage. It automatically attempts a token refresh when an authenticated request receives an unauthorized response.

The default idle-session timeout is one hour. When the timeout is exceeded, active refresh tokens are revoked and the user must sign in again. Deployments can change this timeout with `SESSION_TIMEOUT_SECONDS`.

Signing out revokes the current refresh token and clears the browser session. Password resets and password changes revoke all refresh tokens for the affected user.

## Password Reset by an Administrator

There is no public “forgot password” workflow. Password recovery is administrator-managed:

1. The Administrator opens **User Management**.
2. The Administrator finds the user and selects **Reset Password**.
3. After confirmation, the backend generates and emails a new temporary password.
4. Existing sessions for that user are revoked.
5. The user signs in with the temporary password and must change it in Settings.

If the reset email cannot be sent, the backend restores the previous password state. This prevents the account from being left with an unknown temporary password.

## Editing, Deactivating, and Deleting Users

Administrators can edit a user's name, email, department, and role.

Changing a role deactivates the user's current patient assignments and rejects pending assignment requests addressed to that user. Assignments must then be recreated under the correct role.

The normal **Delete User** action is a reversible deactivation:

- the account status becomes `INACTIVE`;
- the user can no longer sign in;
- active patient assignments are deactivated; and
- pending assignment requests for that user are rejected.

An Administrator can later reactivate the account. Reactivation restores login access but does not automatically recreate old patient assignments.

Permanent deletion is available only after deactivation and cannot be undone. The system prevents an Administrator from deleting their own signed-in account. When permanent deletion is allowed, linked references that cannot be removed are reassigned to the acting Administrator before the user row is deleted.

## Navigation by Role

After completing any mandatory temporary-password change, every signed-in user can access:

- Dashboard
- Patients
- Settings

Additional sidebar areas are shown as follows:

| Area | Roles shown in the browser |
| --- | --- |
| Clinic Queue | All six roles |
| Student Cases | Administrator, Orthodontist, Dental Surgeon, Student |
| Reports | Administrator |
| Materials | Administrator, Nurse |
| Request Approvals | Orthodontist, Dental Surgeon |
| User Management | Administrator |
| Audit Log | Administrator |

Page visibility is only the first layer. The backend also checks the user's role, operation, and—where applicable—patient assignment.

## Patient Assignment Scope

Orthodontists, dental surgeons, and students can access clinical information only for patients with an active assignment matching their role and user ID.

Administrators, receptionists, and nurses have broader patient-directory access for their operational duties. Feature-specific restrictions still apply; broad access to a patient record does not mean every tab can be viewed or edited.

For assignment rules and role-specific workflows, see [Role and End-to-End Workflows](role-workflows.md). For the detailed permission summary, see [Roles and Permissions](roles-and-permissions.md).
