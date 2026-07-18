# Role and End-to-End Workflows

This guide describes how the current OrthoFlow features fit together during normal clinic work. It focuses on the browser application; backend authorization remains the final enforcement layer.

## Administrator Workflow

Administrators maintain system access and oversight rather than performing every operational mutation.

Typical sequence:

1. Create staff and Student accounts in **User Management**.
2. Confirm temporary-password email delivery.
3. Edit roles/departments or reactivate accounts when staffing changes.
4. Monitor broad patient activity from Dashboard and Patients.
5. Review Reports and export operational summaries.
6. Search the Audit Log when investigating a change.
7. Review inventory without changing stock.
8. Manage recoverable and permanent deletion where Administrator cleanup is supported.

Administrators do not manage live queue membership/status through the current browser UI, do not mutate inventory, and do not perform Student task reviews.

## Receptionist Workflow

Reception coordinates registration, assignment requests, appointments, queue entry, and payments.

Typical new-patient sequence:

1. Open **Patients** and select **Add New Patient**.
2. Enter the registration and contact details.
3. Open **Assign Care Team** and select Orthodontist/Dental Surgeon targets.
4. Wait for each target clinician to approve the request.
5. Open the patient profile and schedule visits.
6. Send a reminder when required and an email address is available.
7. On arrival, add the patient to the live queue.
8. Update the queue status or remove an incorrect entry.
9. Record payment details in the patient profile.

Reception can read treatment notes but does not see patient history, dental chart, documents, diagnosis, or patient-material tabs.

## Orthodontist Workflow

Orthodontists work only with patients actively assigned to them.

Typical sequence:

1. Review **Request Approvals** and approve or reject Reception assignment/removal requests.
2. Open the assigned patient from **Patients**.
3. Complete or review history, diagnosis, dental chart, documents, and treatment notes.
4. Complete consultant-only history decisions.
5. Assign Dental Surgeons or Students to the patient when appropriate.
6. Save and download annotated chart versions.
7. Review or clean up clinical-note, document, and chart-version recycle bins.
8. Update the patient's queue status during care.
9. If supervising a Student, assign tasks and review completed work under **Student Cases**.

Orthodontists can read payment records but cannot create them through the browser.

## Dental Surgeon Workflow

Dental Surgeons work only with assigned patients and can supervise Students attached to those patients.

Typical sequence:

1. Approve or reject assignment requests addressed to them.
2. Open the assigned patient record.
3. Update history, dental chart, documents, diagnosis, treatment notes, and materials used.
4. Assign Students to their own patient when supervision is required.
5. Update queue status during consultation/treatment.
6. Assign and review Student case tasks.

Dental Surgeons can read payment records but cannot manage them. They can upload documents but cannot use the document recycle-bin controls reserved for Orthodontists.

## Nurse Workflow

Nurses have broad patient-directory visibility for operational support. They do not receive the Patient History, Dental Chart, Documents, Diagnosis, Treatment Plans/Notes, or Payment tabs in the current browser interface, but they can view **Materials Used**.

Typical sequence:

1. Review Dashboard and Clinic Queue state.
2. Open Patients for general patient information and visit visibility.
3. Open **Materials** to create/edit inventory items, restock, and manage the inventory recycle bin.
4. Review patient material-usage records when needed.

Nurses can view the queue but cannot add, remove, or change queue status in the current browser UI.

## Student Workflow

Students see only assigned patients and Student cases.

Typical sequence:

1. Open an assigned patient.
2. Record history, chart findings, uploads, diagnosis, treatment entries, and materials used under supervision.
3. Update permitted queue entries during the clinical workflow.
4. Open **Student Cases**.
5. Move an assigned task to in progress or completed and add completion notes.
6. Review supervisor feedback and revise work when a task is returned.

Students cannot view payment records, cannot delete clinical records, and cannot access unassigned patients.

## End-to-End: Creating a User

```text
Administrator creates account
        ↓
Backend generates temporary password
        ↓
Temporary password is emailed
        ↓
User signs in
        ↓
User is restricted to Settings
        ↓
User changes password and signs in again
        ↓
Role-aware navigation becomes available
```

If the email does not arrive, check SMTP configuration and backend logs. The Administrator can issue another reset email from User Management.

## End-to-End: Registering and Assigning a Patient

```text
Reception registers patient
        ↓
Registration visit is created
        ↓
Reception requests clinician assignment
        ↓
Target clinician approves or rejects
        ↓
Approved assignment grants patient-scoped access
        ↓
Orthodontist/Dental Surgeon may directly assign Student
        ↓
Student case is created or restored
```

Reception requests do not grant access until approved. Direct clinical assignment is limited to the assigning clinician's own patients.

## End-to-End: Appointment and Queue

```text
Reception schedules visit
        ↓
Automatic or manual reminder may be sent
        ↓
Reception adds arriving patient to queue
        ↓
In Waiting Room
        ↓
Under Consultation
        ↓
Under Treatment
        ↓
Completed
```

Visit status and queue status are separate. Completing a queue entry does not itself replace the visit record; Reception should also record the appropriate visit outcome.

## End-to-End: Clinical Documentation

1. Confirm the clinician/Student has an active patient assignment.
2. Record the structured Patient History.
3. Add/update dental chart findings.
4. Save an immutable chart version when a clinical snapshot is required.
5. Upload supporting documents.
6. Record Diagnosis entries.
7. Add Treatment Plans and Notes, including execution state and outcomes.
8. Record materials used; inventory adjusts automatically.
9. Download a chart PDF or consolidated patient-record PDF when required.

Recycle-bin actions should be used before permanent deletion so mistakes remain recoverable.

## End-to-End: Student Supervision

```text
Clinician assigns Student to own patient
        ↓
Student case becomes accessible
        ↓
Supervisor assigns task and deadline
        ↓
Student records progress/completion notes
        ↓
Supervisor reviews task
        ├── Needs more work → returns to active work
        ├── Completed → remains awaiting acceptance
        └── Reviewed → moves to reviewed history
```

Removing the Student assignment prevents normal Student access. The case remains visible for supervisor/Administrator cleanup so historical task information is not silently lost.

## End-to-End: Recoverable Deletion

Documents, diagnosis/treatment notes, payments, patient-material usage, chart versions, inventory items, users, and patients use controlled lifecycle actions. The exact owner of delete/restore permissions varies by feature.

The general pattern is:

```text
Active record
    ↓ soft delete/deactivate
Recycle bin or inactive state
    ├── restore/reactivate → Active record
    └── permanent delete → Irreversible removal
```

Always verify the selected record and use the confirmation acknowledgement before permanent deletion.
