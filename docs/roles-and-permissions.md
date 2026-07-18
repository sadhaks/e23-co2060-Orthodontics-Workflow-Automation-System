# Roles and Permissions

The system uses role-based access control. Some roles can only access patients assigned to them.

For step-by-step role activities, see [Role and End-to-End Workflows](role-workflows.md). For the behavior of each screen, see the [Complete Feature Guide](feature-guide.md).

## Roles

- `ADMIN`
- `ORTHODONTIST`
- `DENTAL_SURGEON`
- `NURSE`
- `RECEPTION`
- `STUDENT`

## Simple Role Summary

| Role | Main Purpose |
| --- | --- |
| `ADMIN` | User administration, audit logs, reports, and broad patient/workflow oversight |
| `ORTHODONTIST` | Clinical supervision, patient care, approvals, and student case assignment |
| `DENTAL_SURGEON` | Clinical patient care, treatment documentation, and assigned student supervision |
| `NURSE` | Patient/queue visibility and inventory/material management |
| `RECEPTION` | Patient registration, visits, payments, queue workflow |
| `STUDENT` | Assigned patient/case workflow under supervision |

## Current Browser Feature Access

| Feature | Current browser behavior |
| --- | --- |
| User management | Administrator creates, edits, resets, deactivates, reactivates, and permanently deletes users |
| Audit logs | Administrator has read-only access with search and filters |
| Reports | Administrator views drill-down reports and exports PDF/print, XLSX, or CSV |
| Patient registration/general editing | Receptionist creates and edits; Administrator manages inactive/permanent-delete lifecycle |
| Patient profile viewing | Administrator, Nurse, and Receptionist have broad general access; Orthodontist, Dental Surgeon, and Student access is assignment-scoped |
| Patient assignment | Receptionist requests clinician changes; target clinicians approve/reject; Orthodontist directly assigns Dental Surgeons/Students; Dental Surgeon directly assigns Students |
| Visits | All roles can view visits available within their patient scope; Receptionist schedules, changes status, and sends manual reminders in the UI |
| Clinic queue | All roles view; Student view is assignment-scoped; Receptionist manages membership; Receptionist, Orthodontist, Dental Surgeon, and Student update status |
| Patient history | Administrator reads; assigned Orthodontist, Dental Surgeon, and Student edit; consultant fields are Orthodontist-only |
| Dental chart | Administrator reads; assigned Orthodontist, Dental Surgeon, and Student edit; Orthodontist manages version deletion/restoration |
| Documents | Administrator and assigned clinical/Student roles read; assigned clinical/Student roles upload; Orthodontist manages trash |
| Diagnosis | Administrator and assigned clinical/Student roles read; assigned clinical/Student roles create/edit; Orthodontist manages bin |
| Treatment plans/notes | Administrator and Receptionist read; assigned clinical/Student roles create/edit; Orthodontist manages bin and supervisor-review type |
| Payments | Administrator, Receptionist, and assigned Orthodontist/Dental Surgeon read; Receptionist creates/edits; Administrator manages bin |
| Patient materials used | Administrator, Nurse, and assigned clinical/Student roles read; assigned clinical/Student roles create/edit; Administrator manages bin |
| Materials/inventory | Administrator reads; Nurse creates, edits, restocks, deletes, restores, and permanently deletes through the UI |
| Student cases | Administrator has oversight/cleanup; Orthodontist and Dental Surgeon supervise; Student updates assigned work |
| Settings | Every role changes its own password; mandatory temporary-password change is enforced here |

## Assignment-Based Access

Some users do not automatically see every patient.

Examples:

- A student normally works with assigned patients/cases.
- Dental surgeons and orthodontists can be scoped by assignment.
- Orthodontists and dental surgeons can view and manage student cases for students they supervise.
- Admins can view student case progress and delete removed student cases when cleanup is needed.
- Reception, Nurse, and Admin roles have broader patient-viewing access.

## UI and API Scope

Sidebar visibility is not always identical to backend API authorization. In particular:

- inventory read endpoints accept any authenticated role, although the page is shown only to Administrator and Nurse;
- the backend permission matrix permits patient creation for Administrator, although the current Patient Directory shows **Add New Patient** only to Receptionist;
- the backend appointment matrix permits additional create/update operations for some roles, while the current Patient Profile shows appointment-management controls only to Receptionist; and
- Administrator has broad backend clinical permissions, while the current Patient Profile deliberately presents several clinical tabs as read-only.

The backend remains the final security boundary. The browser guide documents actions users can actually initiate through the current interface.

## Practical Maintenance Note

When testing permissions, create one user for each role and verify:

- visible sidebar items
- patient access
- create/update/delete permissions
- reports and audit-log access
- queue access
