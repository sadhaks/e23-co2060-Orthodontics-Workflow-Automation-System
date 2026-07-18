# Status and Lifecycle Reference

This reference lists the main states users encounter and explains what each state means in the current implementation.

## User Accounts

| Status | Meaning |
| --- | --- |
| `ACTIVE` | User can authenticate, subject to password and permission rules |
| `INACTIVE` | Login is blocked; assignments are deactivated when the account is deactivated |

`must_change_password=true` is an additional account flag. It restricts the user to profile, password-change, and logout operations until a new password is set.

## Patients

| Status | Meaning |
| --- | --- |
| `ACTIVE` | Active patient record |
| `CONSULTATION` | Patient is in the consultation stage |
| `MAINTENANCE` | Patient is in maintenance/follow-up care |
| `COMPLETED` | Main treatment workflow is completed |

Patient inactivity/deletion is stored separately from the clinical status. An inactive patient can be reactivated by an Administrator. Permanent deletion requires the patient to be inactive first.

## Assignment Requests

| Status | Meaning |
| --- | --- |
| `PENDING` | Waiting for the target Orthodontist or Dental Surgeon |
| `APPROVED` | Assignment or removal was accepted and applied |
| `REJECTED` | Requested change was refused or invalidated by an account change |

Assignment request action types are `ASSIGN` and `REMOVE`.

## Visits

| Status | Meaning |
| --- | --- |
| `SCHEDULED` | Future or pending appointment |
| `COMPLETED` | Visit took place and was completed |
| `CANCELLED` | Visit was cancelled |
| `DID_NOT_ATTEND` | Patient did not attend |

Reminder state is tracked separately with `reminder_sent_at` and a manual/automatic source. The reminder service avoids sending the same reminder more than once after it is recorded.

## Clinic Queue

| Status | Meaning |
| --- | --- |
| `IN_WAITING_ROOM` | Patient has arrived and is waiting |
| `UNDER_CONSULTATION` | Consultation is in progress |
| `UNDER_TREATMENT` | Treatment is in progress |
| `COMPLETED` | Queue workflow is complete |

Queue priority values supported by the backend are `LOW`, `NORMAL`, `HIGH`, and `URGENT`.

## Student Cases

| Status | Meaning |
| --- | --- |
| `ASSIGNED` | Case is assigned and active |
| `PENDING_VERIFICATION` | Work has been submitted for supervisor verification |
| `VERIFIED` | Supervisor accepted the case state |
| `REJECTED` | Supervisor rejected the submitted case state |

The current browser page emphasizes task-level supervision while retaining these case-level statuses for filtering and summary.

## Student Tasks

| Status | Meaning |
| --- | --- |
| `ASSIGNED` | Task has been assigned but not started |
| `IN_PROGRESS` | Student is working on the task or supervisor returned it for more work |
| `COMPLETED` | Student marked work complete; supervisor acceptance may still be pending |
| `REVIEWED` | Supervisor accepted the task; it moves to reviewed history |

A task is displayed as overdue when it has passed its deadline and has not reached the reviewed state.

## Treatment Execution

| Status | Meaning |
| --- | --- |
| `PLANNED` | Procedure is planned but not started |
| `IN_PROGRESS` | Procedure/work is underway |
| `COMPLETED` | Procedure completed successfully |
| `PARTIAL` | Only part of the planned work was completed |
| `FAILED` | Planned outcome was not achieved |
| `CANCELLED` | Planned work was cancelled |

Clinical note types are `DIAGNOSIS`, `TREATMENT`, `OBSERVATION`, `PROGRESS`, and `SUPERVISOR_REVIEW`.

## Payments

| Status | Meaning |
| --- | --- |
| `PENDING` | Amount is expected but not fully paid |
| `PAID` | Payment completed |
| `PARTIAL` | Only part of the amount was paid |
| `REFUNDED` | Payment was refunded |
| `VOID` | Record was voided |

Payment methods are `CASH`, `CARD`, `BANK_TRANSFER`, `ONLINE`, `CHEQUE`, and `OTHER`.

## Inventory

| Alert | Rule |
| --- | --- |
| `NORMAL` | Quantity is above the minimum threshold |
| `LOW_STOCK` | Quantity is positive but at or below the minimum threshold |
| `OUT_OF_STOCK` | Quantity is zero |

Inventory transaction types are:

- `IN` for incoming/restocked quantity;
- `OUT` for consumed/removed quantity; and
- `ADJUSTMENT` for a direct stock correction.

Patient material usage creates corresponding transactions and keeps the inventory quantity synchronized when usage records are created, edited, deleted, or restored.

## Recycle Bins and Permanent Deletion

| Record type | Browser role that manages deletion/bin |
| --- | --- |
| Patient | Administrator |
| User | Administrator |
| Document | Orthodontist |
| Diagnosis/treatment note | Orthodontist |
| Dental-chart version | Orthodontist |
| Payment record | Administrator |
| Patient material usage | Administrator |
| Inventory item | Nurse |

Most permanent-delete operations require the record to be in its inactive/trash state first. Permanent deletion is irreversible and may remove associated object-storage content or reassign protected references, depending on the record type.

## Audit Events

Important mutations and authentication actions are written to `audit_logs`, including login/logout, user changes, assignments, clinical record changes, queue changes, password actions, and deletion/restoration actions.

Audit rows are read-only in the application. The retention job deletes rows older than the configured period (180 days by default). If archival is enabled, rows are copied to `audit_logs_archive` before deletion.

