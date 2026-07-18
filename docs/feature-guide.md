# Complete Feature Guide

This guide explains the behavior visible in the current OrthoFlow browser application. Available controls vary by role and patient assignment. When a role can read a feature but not modify it, the interface is read-only or hides the mutation controls.

## Dashboard

The Dashboard combines multiple live API results into one operational view:

- total or assigned patients;
- completed or did-not-attend visit outcomes recorded today;
- patients currently waiting in the clinic queue;
- low-stock and out-of-stock inventory alerts;
- up to six upcoming scheduled appointments; and
- an operational snapshot appropriate to the signed-in role.

For Orthodontists, Dental Surgeons, and Students, patient and queue counts are assignment-scoped. Their operational snapshot focuses on student cases and task progress. Other roles see broader active-patient, queue, and appointment information.

The **Refresh** action requests fresh values. If one dashboard data source is unavailable, other cards can still load.

## Patient Directory

The Patient Directory is the main entry point for patient records.

### Finding patients

Users can:

- search by patient name or medical record number (MRN);
- filter by assigned Orthodontist when the role exposes that filter;
- refresh the current results; and
- open a patient profile.

Orthodontists, Dental Surgeons, and Students see only actively assigned patients. Administrators, Receptionists, and Nurses have broader directory visibility.

### Registering patients

The browser exposes **Add New Patient** to Receptionists. The form records:

- first and last name;
- registration date and time;
- birth date or age;
- gender;
- phone and email;
- address; and
- province.

The backend generates a patient code when one is not supplied and creates a registration visit for the patient. Patient lifecycle statuses are `ACTIVE`, `CONSULTATION`, `MAINTENANCE`, and `COMPLETED`.

### Editing and patient lifecycle

Receptionists can edit general patient details from the directory. Administrators can view active or inactive patients, set a patient inactive, reactivate an inactive patient, and permanently delete a patient that is already inactive.

Permanent deletion cannot be undone. Clinical records linked through database relationships may also affect whether a hard deletion can complete safely.

### Full patient-record export

An assigned Orthodontist, Dental Surgeon, or Student can download a consolidated patient-record PDF from the directory. The export is generated on demand from current database information and is streamed to the requester; it is not stored in R2.

## Care-Team Assignment and Approval

The **Assign Care Team** action is available to Receptionists, Orthodontists, and Dental Surgeons, with different rules:

- Receptionists can request Orthodontist and Dental Surgeon assignment changes. The target clinician must approve or reject the request.
- Orthodontists can directly assign Dental Surgeons and Students, but only for patients assigned to that Orthodontist.
- Dental Surgeons can directly assign Students, but only for patients assigned to that Dental Surgeon.

Reception-originated removal requests also require the affected clinician's approval. Pending requests appear under **Request Approvals** and as a notification count in the sidebar.

When a clinician directly assigns a Student, OrthoFlow creates or restores the corresponding supervised student case. Removing an assignment removes that user's assignment-scoped access; historical records remain in the database.

## Patient Profile

Every patient profile starts with a summary header and role-filtered tabs.

### Overview

The Overview displays the patient identity/status header, contact information, assigned Orthodontist, assigned Dental Surgeon, assigned Student, and up to five upcoming scheduled appointments.

### Visits

The Visits tab lists the patient's appointment history and statuses. In the current browser UI, Receptionists can:

- schedule a visit with date/time and optional appointment type;
- update a visit status; and
- send a manual appointment reminder for a scheduled visit with a patient email address.

Visit statuses are:

- `SCHEDULED`
- `COMPLETED`
- `CANCELLED`
- `DID_NOT_ATTEND`

The automatic reminder job separately scans scheduled appointments within its configured future window. A reminder is recorded only once using the reminder timestamp.

### Patient History

The Patient History tab is available to Administrators and assigned Orthodontists, Dental Surgeons, and Students. Clinical roles can edit the history; Administrators have read access.

The form organizes the orthodontic case history into:

- automatically derived patient/assignment details;
- past dental, orthodontic, medical, family, and social history;
- allergies and habits;
- dental and periodontal assessment;
- extra-oral facial, airway, skeletal, and soft-tissue assessment;
- intra-oral segment, canine, incisor, molar, bite, and centre-line findings;
- IOTN and suitability information;
- referral and treatment-mode selections; and
- consultant decisions, priority, date, and signature.

Consultant-only decision fields can be edited by an Orthodontist. Saving updates the patient's current history record.

### Dental Chart

The Dental Chart is readable by Administrators and assigned Orthodontists, Dental Surgeons, and Students. Assigned clinical roles and Students can edit chart entries.

The chart supports:

- standard and custom tooth chart entries;
- pathology and treatment annotations;
- visual color/notation rendering;
- saving the current annotated chart as a named, immutable version;
- listing versions chronologically; and
- downloading a graphical PDF version.

Orthodontists alone can manage the chart-version recycle bin, restore deleted versions, and permanently delete versions. PDF rendering uses Playwright/Chromium when available and falls back to a simpler PDF if visual rendering fails.

### Documents

Documents are readable by Administrators and assigned Orthodontists, Dental Surgeons, and Students. Assigned clinical roles and Students can upload; Orthodontists manage deletion and restoration.

The portal supports drag-and-drop or file selection, multiple simultaneous uploads, progress display, download, and refresh. The frontend accepts up to 10 files and 100 MB total per batch. The backend separately applies its configured per-file size and extension rules.

Files are categorized automatically as radiograph, photo, note, or scan based on their type. In production, file bytes are stored in R2/S3-compatible storage and metadata remains in MySQL.

Deleting a document first moves it to trash. Orthodontists can restore it or permanently delete it from trash; permanent deletion also removes the stored object when possible.

### Diagnosis

Diagnosis entries are stored as clinical notes with type `DIAGNOSIS`. Administrators and assigned clinical roles/Students can read them. Assigned Orthodontists, Dental Surgeons, and Students can create and edit entries. Orthodontists can move entries to the bin, restore them, or permanently delete them.

### Treatment Plans and Notes

This timeline can be read by Administrators, Receptionists, and assigned Orthodontists, Dental Surgeons, and Students.

Assigned clinical roles and Students can create and edit:

- progress notes;
- treatment notes;
- observations; and
- supervisor reviews, when the author is an Orthodontist.

Treatment-plan entries can include a planned procedure, planned time, executed time, execution status, outcome/success note, and detailed note. Execution statuses are `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `PARTIAL`, `FAILED`, and `CANCELLED`.

Only Orthodontists manage deletion, restoration, and permanent deletion for clinical notes through the browser.

### Materials Used

This tab is visible to Administrators, Nurses, and assigned Orthodontists, Dental Surgeons, and Students.

Assigned clinical roles and Students can record an inventory item, quantity, date/time used, purpose, and notes. Creating a usage record reduces inventory. Editing adjusts stock by the difference; moving a usage record to the bin returns its stock; restoring it consumes stock again if sufficient quantity remains.

Administrators manage the usage-record recycle bin and permanent deletion. Nurses can read patient usage but manage the underlying inventory from the Materials page.

### Payment Records

Payment records are visible to Administrators, Receptionists, and assigned Orthodontists and Dental Surgeons. Receptionists can add and edit records. Administrators manage deletion, restoration, and permanent deletion.

Each record includes payment date/time, positive amount, three-letter currency, payment method, payment status, reference number, and optional notes.

Payment methods are `CASH`, `CARD`, `BANK_TRANSFER`, `ONLINE`, `CHEQUE`, and `OTHER`. Statuses are `PENDING`, `PAID`, `PARTIAL`, `REFUNDED`, and `VOID`.

## Live Clinic Queue

All roles can open the queue. Administrators, Nurses, Receptionists, Orthodontists, and Dental Surgeons see the global queue. Students see entries assigned to them.

Receptionists can add a registered active patient, select an initial status, and remove an entry. Receptionists, Orthodontists, Dental Surgeons, and Students can change status for entries they are permitted to access.

The queue moves through:

1. `IN_WAITING_ROOM`
2. `UNDER_CONSULTATION`
3. `UNDER_TREATMENT`
4. `COMPLETED`

The page displays status totals, MRN, assigned clinical staff, arrival/wait information, and status controls. Completed entries remain visible temporarily and are automatically removed after 24 hours when queue operations trigger cleanup.

## Student Cases

Student cases connect a patient, Student, and supervising Orthodontist or Dental Surgeon.

Orthodontists and Dental Surgeons can:

- view cases they supervise;
- assign a task title, description, and optional deadline;
- review Student completion notes;
- return a task for more work, leave it completed, or mark it reviewed/accepted; and
- delete active tasks when permitted.

Students can:

- view their active assigned cases;
- update task status from assigned to in progress or completed; and
- add completion notes.

Reviewed tasks move to a retained reviewed section. Overdue tasks are identified from their deadlines. Administrators have read-only oversight of task progress and review information, with cleanup access for cases whose Student assignment was removed.

## Materials and Inventory

The Materials page is shown to Administrators and Nurses. Administrators have a read-only browser view; Nurses manage inventory.

The page supports:

- item name, category, unit, quantity, and minimum threshold;
- search and category filtering;
- normal, low-stock, and out-of-stock indicators;
- creating and editing items;
- restocking through an `IN` transaction;
- soft deletion to a recycle bin;
- restoration; and
- permanent deletion after an item has been moved to the bin.

Every stock change records a transaction and acting user. Patient-material usage also creates inventory transactions automatically.

## Reports

Reports are Administrator-only. The page combines patient status, visit activity, procedure counts, and inventory alerts.

Administrators can select periods from the last 24 hours through the last 12 months, filter inventory alerts, open patient drill-down lists for summary cards, export XLSX or CSV files, and use the PDF action to open the browser print dialog for printing or saving the report as PDF.

The report includes:

- total and active patients;
- visits and completed visits in the selected period;
- inventory alert totals;
- patient status distribution;
- visit trends;
- procedure breakdown and status summary; and
- detailed inventory alerts.

## Audit Log

The Audit Log is Administrator-only and read-only.

Administrators can search name, email, action, entity, or IP address; filter by user role; filter by start/end date and time; paginate results; and expand a row to inspect old and new values. Passwords, password hashes, refresh tokens, and tokens are removed from the value display.

The frontend formats audit timestamps in the Asia/Colombo timezone. Audit retention and optional archival are controlled by backend environment variables.

## Settings

Settings currently provides password change for every role. Users must supply the current password and a compliant new password. A mandatory temporary-password change blocks the rest of the application until completed.

For account administration, see [Accounts, Sign-In, and Access](accounts-and-access.md). For recommended task sequences, see [Role and End-to-End Workflows](role-workflows.md).
