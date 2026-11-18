<?php http_response_code(404); exit; ?>
{
    "version": 3,
    "revision": 0,
    "updatedAt": "2026-11-18T09:58:26+00:00",
    "conditions": [
        {
            "id": "cond-knee",
            "name": "Left knee osteoarthritis (sample)",
            "status": "active",
            "diagnosedOn": "2026-04-22",
            "color": "#a4541c",
            "summary": "Synthetic demo condition: ortho follow-ups, physical therapy, and an MRI appeal.",
            "notes": {
                "html": "<p>Demo data only. Not a real patient.</p>",
                "text": "Demo data only. Not a real patient.",
                "imageIds": []
            },
            "sortOrder": 0,
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00",
            "attachments": [
                {
                    "id": "c605d94a3a6cbd6d161038ffc402e80da006a07b5ac34b859acaa935da0df159.png",
                    "name": "Knee x-ray (sample).png",
                    "mime": "image/png",
                    "kind": "image",
                    "bytes": 3618,
                    "label": "imaging",
                    "addedAt": "2026-10-01T17:00:00+00:00"
                }
            ]
        },
        {
            "id": "cond-skin",
            "name": "Basal cell carcinoma, scalp (sample)",
            "status": "active",
            "diagnosedOn": "2026-09-04",
            "color": "#245e6b",
            "summary": "Synthetic demo condition: biopsy, radiation course, and daily wound care.",
            "notes": {
                "html": "<p>Demo data only. Every name here is fictional.</p>",
                "text": "Demo data only. Every name here is fictional.",
                "imageIds": []
            },
            "sortOrder": 1,
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00",
            "attachments": []
        },
        {
            "id": "cond-diabetes",
            "name": "Type 2 diabetes (sample)",
            "status": "active",
            "diagnosedOn": "2024-06-01",
            "color": "#3f6b3a",
            "summary": "Synthetic demo condition: quarterly labs and CGM supplies.",
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "sortOrder": 2,
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00",
            "attachments": []
        }
    ],
    "types": [
        {
            "id": "doctor",
            "name": "Doctors & specialists",
            "singular": "Doctor",
            "icon": "stethoscope",
            "color": "#2f5d8a",
            "titleLabel": "Name",
            "primaryDateField": "",
            "fields": [
                {
                    "id": "specialty",
                    "label": "Specialty",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "role",
                    "label": "Role",
                    "kind": "select",
                    "options": [
                        "Primary care",
                        "Specialist",
                        "Surgeon",
                        "Therapist",
                        "Nurse / NP / PA",
                        "Other"
                    ],
                    "required": false,
                    "target": "",
                    "allowCustom": false
                },
                {
                    "id": "practice",
                    "label": "Clinic or practice",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "phone",
                    "label": "Phone",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "fax",
                    "label": "Fax",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "address",
                    "label": "Address",
                    "kind": "longtext",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "portal",
                    "label": "Portal or website",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "in_network",
                    "label": "In network",
                    "kind": "checkbox",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 0,
            "retiredFields": []
        },
        {
            "id": "visit",
            "name": "Visits",
            "singular": "Visit",
            "icon": "calendar",
            "color": "#a4541c",
            "titleLabel": "Visit",
            "primaryDateField": "date",
            "fields": [
                {
                    "id": "date",
                    "label": "Visit date",
                    "kind": "date",
                    "required": true,
                    "options": [],
                    "target": ""
                },
                {
                    "id": "time",
                    "label": "Time",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "doctor",
                    "label": "Doctor",
                    "kind": "link",
                    "target": "doctor",
                    "options": [],
                    "required": false
                },
                {
                    "id": "visit_kind",
                    "label": "Visit kind",
                    "kind": "select",
                    "options": [
                        "In person",
                        "Lab work",
                        "Imaging",
                        "Telehealth",
                        "Phone",
                        "Urgent / ER",
                        "Procedure"
                    ],
                    "required": false,
                    "target": "",
                    "allowCustom": false
                },
                {
                    "id": "location",
                    "label": "Location",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "status",
                    "label": "Status",
                    "kind": "select",
                    "allowCustom": true,
                    "options": [
                        "Scheduled",
                        "Completed",
                        "Cancelled",
                        "Rescheduled",
                        "No-show"
                    ],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "questions",
                    "label": "Questions to ask",
                    "kind": "longtext",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "outcome",
                    "label": "Outcome / summary",
                    "kind": "longtext",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "follow_up",
                    "label": "Follow-up by",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 1,
            "retiredFields": []
        },
        {
            "id": "letter",
            "name": "Authorization & referral letters",
            "singular": "Letter",
            "icon": "document",
            "color": "#5b4a99",
            "titleLabel": "Letter",
            "primaryDateField": "issued",
            "fields": [
                {
                    "id": "letter_kind",
                    "label": "Kind",
                    "kind": "select",
                    "options": [
                        "Referral",
                        "Prior authorization",
                        "Letter of medical necessity",
                        "Records request",
                        "Other"
                    ],
                    "required": false,
                    "target": "",
                    "allowCustom": false
                },
                {
                    "id": "status",
                    "label": "Status",
                    "kind": "select",
                    "allowCustom": true,
                    "options": [
                        "Requested",
                        "Pending",
                        "Approved",
                        "Denied",
                        "Expired"
                    ],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "issued",
                    "label": "Issued",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "valid_until",
                    "label": "Valid until",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "reference",
                    "label": "Reference / auth #",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "visits_approved",
                    "label": "Visits approved",
                    "kind": "number",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "doctor",
                    "label": "Requested by",
                    "kind": "link",
                    "target": "doctor",
                    "options": [],
                    "required": false
                },
                {
                    "id": "visit",
                    "label": "For visit",
                    "kind": "link",
                    "target": "visit",
                    "options": [],
                    "required": false
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 2,
            "retiredFields": []
        },
        {
            "id": "appeal",
            "name": "Insurance appeals & coordination",
            "singular": "Appeal",
            "icon": "scale",
            "color": "#8f2f45",
            "titleLabel": "Case",
            "primaryDateField": "opened",
            "fields": [
                {
                    "id": "insurer",
                    "label": "Insurer",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "case_number",
                    "label": "Claim / case #",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "status",
                    "label": "Status",
                    "kind": "select",
                    "allowCustom": true,
                    "options": [
                        "Open",
                        "Submitted",
                        "Escalated",
                        "Won",
                        "Lost",
                        "Closed"
                    ],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "opened",
                    "label": "Opened",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "deadline",
                    "label": "Deadline",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "amount",
                    "label": "Amount in dispute ($)",
                    "kind": "number",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "contact",
                    "label": "Rep / contact",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "visit",
                    "label": "Related visit",
                    "kind": "link",
                    "target": "visit",
                    "options": [],
                    "required": false
                },
                {
                    "id": "call_log",
                    "label": "Call log",
                    "kind": "longtext",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 3,
            "retiredFields": []
        },
        {
            "id": "supply",
            "name": "Medical supplies",
            "singular": "Supply",
            "icon": "box",
            "color": "#3f6b3a",
            "titleLabel": "Item",
            "primaryDateField": "ordered",
            "fields": [
                {
                    "id": "supplier",
                    "label": "Supplier / DME",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "quantity",
                    "label": "Quantity",
                    "kind": "number",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "status",
                    "label": "Status",
                    "kind": "select",
                    "allowCustom": true,
                    "options": [
                        "Needed",
                        "Ordered",
                        "Delivered",
                        "Backordered"
                    ],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "ordered",
                    "label": "Ordered",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "reorder",
                    "label": "Reorder by",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "doctor",
                    "label": "Prescribed by",
                    "kind": "link",
                    "target": "doctor",
                    "options": [],
                    "required": false
                },
                {
                    "id": "covered",
                    "label": "Covered by insurance",
                    "kind": "checkbox",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 4,
            "retiredFields": []
        },
        {
            "id": "care",
            "name": "Care",
            "singular": "Care",
            "icon": "bandage",
            "color": "#9a6a00",
            "titleLabel": "Care task",
            "primaryDateField": "date",
            "fields": [
                {
                    "id": "care_kind",
                    "label": "Kind",
                    "kind": "select",
                    "options": [
                        "Wound care",
                        "Dressing change",
                        "PT / OT exercises",
                        "Home health",
                        "Medication",
                        "Other"
                    ],
                    "required": false,
                    "target": "",
                    "allowCustom": false
                },
                {
                    "id": "date",
                    "label": "Date",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "next_due",
                    "label": "Next due",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "performed_by",
                    "label": "Performed by",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "doctor",
                    "label": "Ordered by",
                    "kind": "link",
                    "target": "doctor",
                    "options": [],
                    "required": false
                },
                {
                    "id": "instructions",
                    "label": "Instructions",
                    "kind": "longtext",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "done",
                    "label": "Done",
                    "kind": "checkbox",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 5,
            "retiredFields": []
        },
        {
            "id": "treatment",
            "name": "Treatment",
            "singular": "Treatment",
            "icon": "radiation",
            "color": "#245e6b",
            "titleLabel": "Treatment",
            "primaryDateField": "start",
            "fields": [
                {
                    "id": "modality",
                    "label": "Modality",
                    "kind": "select",
                    "options": [
                        "Radiation",
                        "Chemotherapy",
                        "Infusion",
                        "Surgery",
                        "Physical therapy",
                        "Medication",
                        "Other"
                    ],
                    "required": false,
                    "target": "",
                    "allowCustom": false
                },
                {
                    "id": "status",
                    "label": "Status",
                    "kind": "select",
                    "allowCustom": true,
                    "options": [
                        "Planned",
                        "Active",
                        "Paused",
                        "Completed"
                    ],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "start",
                    "label": "Start",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "end",
                    "label": "End",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "sessions_planned",
                    "label": "Sessions planned",
                    "kind": "number",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "sessions_done",
                    "label": "Sessions completed",
                    "kind": "number",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "doctor",
                    "label": "Treating doctor",
                    "kind": "link",
                    "target": "doctor",
                    "options": [],
                    "required": false
                },
                {
                    "id": "facility",
                    "label": "Facility",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 6,
            "retiredFields": []
        },
        {
            "id": "clinical_event",
            "name": "Clinical events",
            "singular": "Clinical event",
            "icon": "pulse-alert",
            "color": "#b42318",
            "titleLabel": "What happened",
            "primaryDateField": "date",
            "fields": [
                {
                    "id": "date",
                    "label": "Date",
                    "kind": "date",
                    "required": true,
                    "options": [],
                    "target": ""
                },
                {
                    "id": "what_changed",
                    "label": "What changed",
                    "kind": "longtext",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "severity",
                    "label": "Severity",
                    "kind": "select",
                    "options": [
                        "Mild",
                        "Moderate",
                        "Severe",
                        "Emergency"
                    ],
                    "required": false,
                    "target": "",
                    "allowCustom": false
                },
                {
                    "id": "visit",
                    "label": "Related visit",
                    "kind": "link",
                    "target": "visit",
                    "options": [],
                    "required": false
                },
                {
                    "id": "doctor",
                    "label": "Doctor notified",
                    "kind": "link",
                    "target": "doctor",
                    "options": [],
                    "required": false
                },
                {
                    "id": "resolved",
                    "label": "Resolved",
                    "kind": "checkbox",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 7,
            "retiredFields": []
        },
        {
            "id": "insurance_event",
            "name": "Insurance events",
            "singular": "Insurance event",
            "icon": "receipt",
            "color": "#7a2e8a",
            "titleLabel": "Event",
            "primaryDateField": "date",
            "fields": [
                {
                    "id": "date",
                    "label": "Date",
                    "kind": "date",
                    "required": true,
                    "options": [],
                    "target": ""
                },
                {
                    "id": "event_kind",
                    "label": "Event",
                    "kind": "select",
                    "options": [
                        "Denied",
                        "Approved",
                        "Pending",
                        "Info requested",
                        "Partially approved",
                        "Claim paid",
                        "Bill received"
                    ],
                    "required": false,
                    "target": "",
                    "allowCustom": false
                },
                {
                    "id": "reference",
                    "label": "Reference / claim #",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "amount",
                    "label": "Amount ($)",
                    "kind": "number",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "letter",
                    "label": "Related letter",
                    "kind": "link",
                    "target": "letter",
                    "options": [],
                    "required": false
                },
                {
                    "id": "appeal",
                    "label": "Related appeal",
                    "kind": "link",
                    "target": "appeal",
                    "options": [],
                    "required": false
                },
                {
                    "id": "respond_by",
                    "label": "Respond by",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 8,
            "retiredFields": []
        },
        {
            "id": "disruption",
            "name": "Other care disruptions",
            "singular": "Other care disruption",
            "icon": "cone",
            "color": "#6b5b2a",
            "titleLabel": "What happened",
            "primaryDateField": "date",
            "fields": [
                {
                    "id": "date",
                    "label": "Date",
                    "kind": "date",
                    "required": true,
                    "options": [],
                    "target": ""
                },
                {
                    "id": "what_happened",
                    "label": "What happened",
                    "kind": "longtext",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "impact",
                    "label": "Impact",
                    "kind": "select",
                    "options": [
                        "Appointment cancelled",
                        "Rescheduled",
                        "Treatment delayed",
                        "Equipment down",
                        "Supply delay",
                        "Transport problem",
                        "Other"
                    ],
                    "required": false,
                    "target": "",
                    "allowCustom": false
                },
                {
                    "id": "rescheduled_to",
                    "label": "Rescheduled to",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "visit",
                    "label": "Affected visit",
                    "kind": "link",
                    "target": "visit",
                    "options": [],
                    "required": false
                },
                {
                    "id": "treatment",
                    "label": "Affected treatment",
                    "kind": "link",
                    "target": "treatment",
                    "options": [],
                    "required": false
                },
                {
                    "id": "resolved",
                    "label": "Resolved",
                    "kind": "checkbox",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 9,
            "retiredFields": []
        },
        {
            "id": "hh_auth",
            "name": "Home health authorizations",
            "singular": "Home health authorization",
            "icon": "clipboard",
            "color": "#1f6f5c",
            "titleLabel": "Authorization",
            "primaryDateField": "start",
            "fields": [
                {
                    "id": "agency",
                    "label": "Agency",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "discipline",
                    "label": "Nurse / discipline",
                    "kind": "select",
                    "allowCustom": true,
                    "options": [
                        "Skilled nursing",
                        "Wound care nurse",
                        "Physical therapy",
                        "Occupational therapy",
                        "Home health aide"
                    ],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "visits_authorized",
                    "label": "Authorized visits",
                    "kind": "number",
                    "required": true,
                    "options": [],
                    "target": ""
                },
                {
                    "id": "start",
                    "label": "Start date",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "end",
                    "label": "End date",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "reference",
                    "label": "Auth / reference #",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "status",
                    "label": "Status",
                    "kind": "select",
                    "allowCustom": true,
                    "options": [
                        "Pending approval",
                        "Approved",
                        "Waiting for further approval",
                        "Used up",
                        "Expired",
                        "Denied"
                    ],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "insurance_event",
                    "label": "Insurance event",
                    "kind": "link",
                    "target": "insurance_event",
                    "options": [],
                    "required": false
                },
                {
                    "id": "letter",
                    "label": "Authorization letter",
                    "kind": "link",
                    "target": "letter",
                    "options": [],
                    "required": false
                },
                {
                    "id": "previous",
                    "label": "Continues authorization",
                    "kind": "link",
                    "target": "hh_auth",
                    "options": [],
                    "required": false
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 10,
            "retiredFields": []
        },
        {
            "id": "hh_visit",
            "name": "Home health visits",
            "singular": "Home health visit",
            "icon": "home",
            "color": "#3d5a80",
            "titleLabel": "Visit",
            "primaryDateField": "date",
            "fields": [
                {
                    "id": "date",
                    "label": "Visit date",
                    "kind": "date",
                    "required": true,
                    "options": [],
                    "target": ""
                },
                {
                    "id": "time",
                    "label": "Time",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "nurse",
                    "label": "Nurse / clinician",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "authorization",
                    "label": "Authorization",
                    "kind": "link",
                    "target": "hh_auth",
                    "options": [],
                    "required": false
                },
                {
                    "id": "outcome",
                    "label": "Outcome",
                    "kind": "select",
                    "allowCustom": true,
                    "options": [
                        "Scheduled",
                        "Completed",
                        "Missed: waiting for insurance approval",
                        "Missed: nurse unavailable",
                        "Missed: patient at clinic",
                        "Rescheduled"
                    ],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 11,
            "retiredFields": []
        },
        {
            "id": "hh_event",
            "name": "Home health events",
            "singular": "Home health event",
            "icon": "phone",
            "color": "#8a4f7d",
            "titleLabel": "Event",
            "primaryDateField": "date",
            "fields": [
                {
                    "id": "date",
                    "label": "Date",
                    "kind": "date",
                    "required": true,
                    "options": [],
                    "target": ""
                },
                {
                    "id": "event_kind",
                    "label": "Event",
                    "kind": "select",
                    "allowCustom": true,
                    "options": [
                        "Waiting for further approval",
                        "Spoke to home health case manager",
                        "Re-authorization requested",
                        "New visits approved",
                        "Agency rescheduled",
                        "Nurse changed"
                    ],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "contact",
                    "label": "Spoke with",
                    "kind": "text",
                    "options": [],
                    "required": false,
                    "target": ""
                },
                {
                    "id": "authorization",
                    "label": "Authorization",
                    "kind": "link",
                    "target": "hh_auth",
                    "options": [],
                    "required": false
                },
                {
                    "id": "follow_up",
                    "label": "Follow up by",
                    "kind": "date",
                    "options": [],
                    "required": false,
                    "target": ""
                }
            ],
            "builtin": true,
            "archived": false,
            "sortOrder": 12,
            "retiredFields": []
        }
    ],
    "entries": [
        {
            "id": "doc-ortho",
            "conditionId": "cond-knee",
            "typeId": "doctor",
            "title": "Dr. Avery Example (sample)",
            "values": {
                "specialty": "Orthopedic surgery",
                "role": "Surgeon",
                "practice": "Example Bone & Joint Clinic",
                "phone": "555-0100",
                "fax": "555-0101",
                "address": "100 Sample Way, Suite 2\nDemo City, CA 90000",
                "portal": "https://example.org/portal",
                "in_network": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "doc-pt",
            "conditionId": "cond-knee",
            "typeId": "doctor",
            "title": "Morgan Placeholder, DPT (sample)",
            "values": {
                "specialty": "Physical therapy",
                "role": "Therapist",
                "practice": "Demo Motion PT",
                "phone": "555-0110",
                "in_network": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "visit-knee-consult",
            "conditionId": "cond-knee",
            "typeId": "visit",
            "title": "Ortho consult",
            "values": {
                "date": "2026-10-01",
                "time": "9:30 AM",
                "doctor": "doc-ortho",
                "visit_kind": "In person",
                "location": "Example Bone & Joint Clinic",
                "status": "Completed",
                "outcome": "X-ray shows moderate narrowing. Start PT; MRI requested.",
                "follow_up": "2026-11-24"
            },
            "tagIds": [],
            "notes": {
                "html": "<p>Bring the PT progress sheet next time.</p>",
                "text": "Bring the PT progress sheet next time.",
                "imageIds": []
            },
            "attachments": [
                {
                    "id": "bb20ed9d1801a7586d34292478d53a554dcc63573d1d5dfe4a823576c2a6ca80.pdf",
                    "name": "Ortho consultation note.pdf",
                    "mime": "application/pdf",
                    "kind": "pdf",
                    "bytes": 932,
                    "label": "consultation",
                    "addedAt": "2026-10-02T17:00:00+00:00"
                }
            ],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "visit-knee-follow",
            "conditionId": "cond-knee",
            "typeId": "visit",
            "title": "Ortho follow-up",
            "values": {
                "date": "2026-11-24",
                "time": "10:15 AM",
                "doctor": "doc-ortho",
                "visit_kind": "In person",
                "location": "Example Bone & Joint Clinic",
                "status": "Scheduled",
                "questions": "Is an injection an option?\nCan I keep running short distances?"
            },
            "tagIds": [
                "tag-ask",
                "tag-follow-up"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "letter-pt-ref",
            "conditionId": "cond-knee",
            "typeId": "letter",
            "title": "Referral to physical therapy",
            "values": {
                "letter_kind": "Referral",
                "status": "Approved",
                "issued": "2026-10-03",
                "valid_until": "2027-01-01",
                "reference": "REF-DEMO-0042",
                "visits_approved": 12,
                "doctor": "doc-ortho",
                "visit": "visit-knee-consult"
            },
            "tagIds": [
                "tag-paperwork"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "appeal-mri",
            "conditionId": "cond-knee",
            "typeId": "appeal",
            "title": "MRI denial — first-level appeal",
            "values": {
                "insurer": "Sample Health Plan",
                "case_number": "APL-DEMO-7781",
                "status": "Submitted",
                "opened": "2026-10-29",
                "deadline": "2026-11-30",
                "amount": 1850,
                "contact": "Rep “Taylor” (demo), ext. 204",
                "visit": "visit-knee-consult",
                "call_log": "Day 1: called, denial reason = conservative care first.\nDay 3: sent PT notes + letter of medical necessity."
            },
            "tagIds": [
                "tag-billing",
                "tag-follow-up"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "supply-brace",
            "conditionId": "cond-knee",
            "typeId": "supply",
            "title": "Hinged knee brace",
            "values": {
                "supplier": "Demo DME Supply",
                "quantity": 1,
                "status": "Delivered",
                "ordered": "2026-10-09",
                "doctor": "doc-ortho",
                "covered": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "care-pt-home",
            "conditionId": "cond-knee",
            "typeId": "care",
            "title": "Home PT exercise set",
            "values": {
                "care_kind": "PT / OT exercises",
                "date": "2026-11-17",
                "next_due": "2026-11-19",
                "performed_by": "Self",
                "doctor": "doc-pt",
                "instructions": "Quad sets 3×10\nStraight-leg raise 3×10\nHeel slides 2×15",
                "done": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "treat-pt",
            "conditionId": "cond-knee",
            "typeId": "treatment",
            "title": "Physical therapy course",
            "values": {
                "modality": "Physical therapy",
                "status": "Active",
                "start": "2026-10-07",
                "end": "2026-12-18",
                "sessions_planned": 12,
                "sessions_done": 7,
                "doctor": "doc-pt",
                "facility": "Demo Motion PT"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "doc-derm",
            "conditionId": "cond-skin",
            "typeId": "doctor",
            "title": "Dr. Jordan Placeholder (sample)",
            "values": {
                "specialty": "Dermatology",
                "role": "Specialist",
                "practice": "Sample Skin Center",
                "phone": "555-0120",
                "in_network": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "doc-radonc",
            "conditionId": "cond-skin",
            "typeId": "doctor",
            "title": "Dr. Casey Sample (sample)",
            "values": {
                "specialty": "Radiation oncology",
                "role": "Specialist",
                "practice": "Demo Cancer Institute",
                "phone": "555-0130",
                "fax": "555-0131",
                "in_network": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "visit-biopsy",
            "conditionId": "cond-skin",
            "typeId": "visit",
            "title": "Shave biopsy",
            "values": {
                "date": "2026-09-04",
                "doctor": "doc-derm",
                "visit_kind": "Procedure",
                "location": "Sample Skin Center",
                "status": "Completed",
                "outcome": "Pathology: nodular basal cell carcinoma (synthetic)."
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "visit-rad-consult",
            "conditionId": "cond-skin",
            "typeId": "visit",
            "title": "Radiation planning check",
            "values": {
                "date": "2026-11-21",
                "time": "2:00 PM",
                "doctor": "doc-radonc",
                "visit_kind": "In person",
                "location": "Demo Cancer Institute, Level B",
                "status": "Scheduled",
                "questions": "How long until the skin settles after the last session?"
            },
            "tagIds": [
                "tag-ask"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "letter-rad-auth",
            "conditionId": "cond-skin",
            "typeId": "letter",
            "title": "Prior authorization — radiation",
            "values": {
                "letter_kind": "Prior authorization",
                "status": "Approved",
                "issued": "2026-10-19",
                "valid_until": "2026-11-27",
                "reference": "PA-DEMO-5512",
                "visits_approved": 20,
                "doctor": "doc-radonc",
                "visit": "visit-rad-consult"
            },
            "tagIds": [
                "tag-paperwork",
                "tag-urgent"
            ],
            "notes": {
                "html": "<p>Expires before the course ends &#x2014; ask the office to extend.</p>",
                "text": "Expires before the course ends — ask the office to extend.",
                "imageIds": []
            },
            "attachments": [
                {
                    "id": "2f5ab8f7f6d56071b83be5d52a826658f3274c8fcf61fc500ef23065feae7c50.pdf",
                    "name": "Radiation prior auth.pdf",
                    "mime": "application/pdf",
                    "kind": "pdf",
                    "bytes": 821,
                    "label": "insurance",
                    "addedAt": "2026-10-20T17:00:00+00:00"
                }
            ],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "treat-rad",
            "conditionId": "cond-skin",
            "typeId": "treatment",
            "title": "Superficial radiation therapy",
            "values": {
                "modality": "Radiation",
                "status": "Active",
                "start": "2026-11-02",
                "end": "2026-12-02",
                "sessions_planned": 20,
                "sessions_done": 11,
                "doctor": "doc-radonc",
                "facility": "Demo Cancer Institute"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "care-wound",
            "conditionId": "cond-skin",
            "typeId": "care",
            "title": "Scalp wound care",
            "values": {
                "care_kind": "Wound care",
                "date": "2026-11-18",
                "next_due": "2026-11-19",
                "performed_by": "Self",
                "doctor": "doc-radonc",
                "instructions": "Rinse with saline, pat dry.\nThin layer of ointment, non-stick pad.",
                "done": false
            },
            "tagIds": [
                "tag-follow-up"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "supply-dressings",
            "conditionId": "cond-skin",
            "typeId": "supply",
            "title": "Non-stick dressing pads (box of 50)",
            "values": {
                "supplier": "Demo Pharmacy",
                "quantity": 2,
                "status": "Backordered at pharmacy",
                "ordered": "2026-11-13",
                "reorder": "2026-11-27",
                "doctor": "doc-radonc",
                "covered": false
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "doc-endo",
            "conditionId": "cond-diabetes",
            "typeId": "doctor",
            "title": "Dr. Riley Testcase (sample)",
            "values": {
                "specialty": "Endocrinology",
                "role": "Specialist",
                "practice": "Example Metabolic Clinic",
                "phone": "555-0140",
                "in_network": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "visit-a1c",
            "conditionId": "cond-diabetes",
            "typeId": "visit",
            "title": "Quarterly A1C review",
            "values": {
                "date": "2026-12-09",
                "time": "8:00 AM",
                "doctor": "doc-endo",
                "visit_kind": "Telehealth",
                "status": "Scheduled"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "visit-a1c-prev",
            "conditionId": "cond-diabetes",
            "typeId": "visit",
            "title": "Quarterly A1C review",
            "values": {
                "date": "2026-09-09",
                "doctor": "doc-endo",
                "visit_kind": "Telehealth",
                "status": "Completed",
                "outcome": "A1C 6.9 (synthetic). Continue current plan."
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "supply-cgm",
            "conditionId": "cond-diabetes",
            "typeId": "supply",
            "title": "CGM sensors (3-pack)",
            "values": {
                "supplier": "Sample Diabetes Direct",
                "quantity": 1,
                "status": "Delivered",
                "ordered": "2026-11-06",
                "reorder": "2026-12-04",
                "doctor": "doc-endo",
                "covered": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "appeal-cgm",
            "conditionId": "cond-diabetes",
            "typeId": "appeal",
            "title": "CGM coverage",
            "values": {
                "insurer": "Sample Health Plan",
                "case_number": "APL-DEMO-3301",
                "status": "Won",
                "opened": "2026-07-21",
                "amount": 960,
                "call_log": "Approved after endocrinology letter."
            },
            "tagIds": [
                "tag-billing"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "event-wound-worse",
            "conditionId": "cond-skin",
            "typeId": "clinical_event",
            "title": "Wound edge redder and weeping",
            "values": {
                "date": "2026-11-16",
                "what_changed": "More redness around the treated area and clear drainage overnight (synthetic).",
                "severity": "Moderate",
                "visit": "visit-rad-consult",
                "doctor": "doc-radonc",
                "resolved": false
            },
            "tagIds": [
                "tag-ask",
                "tag-follow-up"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [
                {
                    "id": "8fb6af5fb194c2afa6427df48aa40dad4a9c260f2da28cb9a2cfa2b40a391433.png",
                    "name": "Wound check day 14.png",
                    "mime": "image/png",
                    "kind": "image",
                    "bytes": 3545,
                    "label": "progress",
                    "addedAt": "2026-11-16T17:00:00+00:00"
                }
            ],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "event-knee-swelling",
            "conditionId": "cond-knee",
            "typeId": "clinical_event",
            "title": "Knee swelling after stairs",
            "values": {
                "date": "2026-11-09",
                "what_changed": "Swelling after a long stair day; settled with ice in 24 h.",
                "severity": "Mild",
                "doctor": "doc-pt",
                "resolved": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "ins-mri-denied",
            "conditionId": "cond-knee",
            "typeId": "insurance_event",
            "title": "MRI prior authorization denied",
            "values": {
                "date": "2026-10-27",
                "event_kind": "Denied",
                "reference": "DEN-DEMO-1203",
                "amount": 1850,
                "appeal": "appeal-mri",
                "respond_by": "2026-11-30"
            },
            "tagIds": [
                "tag-billing"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "ins-rad-approved",
            "conditionId": "cond-skin",
            "typeId": "insurance_event",
            "title": "Radiation authorization approved",
            "values": {
                "date": "2026-10-20",
                "event_kind": "Approved",
                "reference": "PA-DEMO-5512",
                "letter": "letter-rad-auth"
            },
            "tagIds": [
                "tag-paperwork"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "disrupt-machine",
            "conditionId": "cond-skin",
            "typeId": "disruption",
            "title": "Radiation machine down for repair",
            "values": {
                "date": "2026-11-12",
                "what_happened": "Clinic called: treatment unit offline for maintenance (synthetic).",
                "impact": "Equipment down",
                "rescheduled_to": "2026-11-20",
                "treatment": "treat-rad",
                "resolved": false
            },
            "tagIds": [
                "tag-follow-up"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "disrupt-cancel",
            "conditionId": "cond-diabetes",
            "typeId": "disruption",
            "title": "Telehealth visit cancelled by clinic",
            "values": {
                "date": "2026-11-04",
                "what_happened": "Provider out sick; visit moved.",
                "impact": "Rescheduled",
                "rescheduled_to": "2026-12-09",
                "visit": "visit-a1c",
                "resolved": true
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-auth-1",
            "conditionId": "cond-skin",
            "typeId": "hh_auth",
            "title": "Wound care nursing: first 6 visits",
            "values": {
                "agency": "Sample Home Health Agency",
                "discipline": "Wound care nurse",
                "visits_authorized": 6,
                "start": "2026-10-09",
                "end": "2026-11-08",
                "reference": "HH-DEMO-1101",
                "status": "Used up",
                "insurance_event": "ins-hh-approved"
            },
            "tagIds": [
                "tag-paperwork"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "ins-hh-approved",
            "conditionId": "cond-skin",
            "typeId": "insurance_event",
            "title": "Home health nursing approved (6 visits)",
            "values": {
                "date": "2026-10-08",
                "event_kind": "Approved",
                "reference": "HH-DEMO-1101"
            },
            "tagIds": [
                "tag-paperwork"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v1",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-10-10",
                "time": "10:00 AM",
                "nurse": "Nurse Pat Sample, RN",
                "authorization": "hh-auth-1",
                "outcome": "Completed"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v2",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-10-13",
                "nurse": "Nurse Pat Sample, RN",
                "authorization": "hh-auth-1",
                "outcome": "Completed"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v3",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-10-16",
                "nurse": "Nurse Pat Sample, RN",
                "authorization": "hh-auth-1",
                "outcome": "Completed"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v4",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Dressing change",
            "values": {
                "date": "2026-10-18",
                "authorization": "hh-auth-1",
                "outcome": "Missed: nurse unavailable"
            },
            "tagIds": [],
            "notes": {
                "html": "<p>Agency had no nurse free that day; they did not send a fill-in.</p>",
                "text": "Agency had no nurse free that day; they did not send a fill-in.",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v5",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-10-20",
                "nurse": "Nurse Pat Sample, RN",
                "authorization": "hh-auth-1",
                "outcome": "Completed"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v6",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Dressing change",
            "values": {
                "date": "2026-10-23",
                "nurse": "Nurse Pat Sample, RN",
                "authorization": "hh-auth-1",
                "outcome": "Missed: patient at clinic"
            },
            "tagIds": [],
            "notes": {
                "html": "<p>Overlapped with a radiation session.</p>",
                "text": "Overlapped with a radiation session.",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v7",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-10-27",
                "nurse": "Nurse Lee Example, RN",
                "authorization": "hh-auth-1",
                "outcome": "Completed"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v8",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-10-30",
                "nurse": "Nurse Pat Sample, RN",
                "authorization": "hh-auth-1",
                "outcome": "Completed"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-ev-waiting",
            "conditionId": "cond-skin",
            "typeId": "hh_event",
            "title": "Visits paused until insurance approves more",
            "values": {
                "date": "2026-10-31",
                "event_kind": "Waiting for further approval",
                "contact": "Agency scheduler (demo)",
                "authorization": "hh-auth-1",
                "follow_up": "2026-11-03"
            },
            "tagIds": [
                "tag-follow-up"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v9",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Dressing change",
            "values": {
                "date": "2026-11-02",
                "authorization": "hh-auth-1",
                "outcome": "Missed: waiting for insurance approval"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-ev-case-mgr",
            "conditionId": "cond-skin",
            "typeId": "hh_event",
            "title": "Called the home health case manager",
            "values": {
                "date": "2026-11-04",
                "event_kind": "Spoke to home health case manager",
                "contact": "Case manager Sam Demo",
                "authorization": "hh-auth-1"
            },
            "tagIds": [],
            "notes": {
                "html": "<p>Re-authorization went to the plan on Monday; expect an answer in 2 to 3 business days.</p>",
                "text": "Re-authorization went to the plan on Monday; expect an answer in 2 to 3 business days.",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-auth-2",
            "conditionId": "cond-skin",
            "typeId": "hh_auth",
            "title": "Wound care nursing: 5 more visits",
            "values": {
                "agency": "Sample Home Health Agency",
                "discipline": "Wound care nurse",
                "visits_authorized": 5,
                "start": "2026-11-06",
                "end": "2026-12-06",
                "reference": "HH-DEMO-1188",
                "status": "Approved",
                "letter": "letter-hh-auth-2",
                "previous": "hh-auth-1"
            },
            "tagIds": [
                "tag-paperwork"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "letter-hh-auth-2",
            "conditionId": "cond-skin",
            "typeId": "letter",
            "title": "Home health re-authorization notice",
            "values": {
                "letter_kind": "Prior authorization",
                "status": "Approved",
                "issued": "2026-11-05",
                "valid_until": "2026-12-06",
                "reference": "HH-DEMO-1188",
                "visits_approved": 5
            },
            "tagIds": [
                "tag-paperwork"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v10",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-11-07",
                "nurse": "Nurse Pat Sample, RN",
                "authorization": "hh-auth-2",
                "outcome": "Completed"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v11",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-11-10",
                "nurse": "Nurse Pat Sample, RN",
                "authorization": "hh-auth-2",
                "outcome": "Completed"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v12",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-11-14",
                "nurse": "Nurse Lee Example, RN",
                "authorization": "hh-auth-2",
                "outcome": "Completed"
            },
            "tagIds": [],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "hh-v13",
            "conditionId": "cond-skin",
            "typeId": "hh_visit",
            "title": "Wound check and dressing change",
            "values": {
                "date": "2026-11-20",
                "time": "11:00 AM",
                "nurse": "Nurse Pat Sample, RN",
                "authorization": "hh-auth-2",
                "outcome": "Scheduled"
            },
            "tagIds": [
                "tag-follow-up"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        },
        {
            "id": "visit-lab",
            "conditionId": "cond-diabetes",
            "typeId": "visit",
            "title": "Fasting lab draw",
            "values": {
                "date": "2026-09-07",
                "time": "7:30 AM",
                "visit_kind": "Lab work",
                "location": "Sample Lab Services",
                "status": "Completed",
                "outcome": "A1C and lipid panel drawn (synthetic)."
            },
            "tagIds": [
                "tag-paperwork"
            ],
            "notes": {
                "html": "",
                "text": "",
                "imageIds": []
            },
            "attachments": [
                {
                    "id": "e3c49984899af284bbc8742f1e362b955b50b0013e39b786f6f3ab542bbb6594.pdf",
                    "name": "Sample lab report.pdf",
                    "mime": "application/pdf",
                    "kind": "pdf",
                    "bytes": 975,
                    "label": "lab",
                    "addedAt": "2026-09-08T17:00:00+00:00"
                }
            ],
            "createdAt": "2026-11-18T09:58:26+00:00",
            "updatedAt": "2026-11-18T09:58:26+00:00"
        }
    ],
    "tags": [
        {
            "id": "tag-follow-up",
            "label": "Follow-up needed",
            "color": "#a4541c"
        },
        {
            "id": "tag-paperwork",
            "label": "Paperwork",
            "color": "#5b4a99"
        },
        {
            "id": "tag-billing",
            "label": "Billing",
            "color": "#8f2f45"
        },
        {
            "id": "tag-ask",
            "label": "Ask the doctor",
            "color": "#2f5d8a"
        },
        {
            "id": "tag-urgent",
            "label": "Urgent",
            "color": "#b42318"
        }
    ],
    "docLabels": [
        {
            "id": "lab",
            "label": "Lab",
            "builtin": true
        },
        {
            "id": "consultation",
            "label": "Consultation Note",
            "builtin": true
        },
        {
            "id": "pcp",
            "label": "PCP Note",
            "builtin": true
        },
        {
            "id": "progress",
            "label": "Progress Note",
            "builtin": true
        },
        {
            "id": "imaging",
            "label": "Imaging",
            "builtin": true
        },
        {
            "id": "discharge",
            "label": "Discharge Summary",
            "builtin": true
        },
        {
            "id": "insurance",
            "label": "Insurance Letter",
            "builtin": true
        },
        {
            "id": "other",
            "label": "Other",
            "builtin": true
        }
    ],
    "filters": [],
    "demoSeed": true
}