<?php
declare(strict_types=1);
require_once __DIR__ . '/domain.php';

/**
 * Clearly synthetic records for the public demo account. Every person and condition is
 * labelled "(sample)" or uses an obviously fictional name. Dates are relative to $today
 * so the demo always has history and upcoming items. Never used for the wf account.
 */
function demo_doc(?string $today = null): array {
    $base = new DateTimeImmutable($today ?? date('Y-m-d'));
    $d = fn(int $days) => $base->modify(($days >= 0 ? '+' : '') . $days . ' days')->format('Y-m-d');
    $doc = new_doc();
    $doc['demoSeed'] = true;
    $notes = fn(string $html) => clean_notes(['html' => $html]);
    $doc['tags'] = [
        ['id' => 'tag-follow-up', 'label' => 'Follow-up needed', 'color' => '#a4541c'],
        ['id' => 'tag-paperwork', 'label' => 'Paperwork', 'color' => '#5b4a99'],
        ['id' => 'tag-billing', 'label' => 'Billing', 'color' => '#8f2f45'],
        ['id' => 'tag-ask', 'label' => 'Ask the doctor', 'color' => '#2f5d8a'],
        ['id' => 'tag-urgent', 'label' => 'Urgent', 'color' => '#b42318'],
    ];
    $doc['conditions'] = [
        ['id' => 'cond-knee', 'name' => 'Left knee osteoarthritis (sample)', 'status' => 'active', 'diagnosedOn' => $d(-210), 'color' => '#a4541c', 'summary' => 'Synthetic demo condition: ortho follow-ups, physical therapy, and an MRI appeal.', 'notes' => $notes('<p>Demo data only. Not a real patient.</p>'), 'sortOrder' => 0],
        ['id' => 'cond-skin', 'name' => 'Basal cell carcinoma, scalp (sample)', 'status' => 'active', 'diagnosedOn' => $d(-75), 'color' => '#245e6b', 'summary' => 'Synthetic demo condition: biopsy, radiation course, and daily wound care.', 'notes' => $notes('<p>Demo data only. Every name here is fictional.</p>'), 'sortOrder' => 1],
        ['id' => 'cond-diabetes', 'name' => 'Type 2 diabetes (sample)', 'status' => 'active', 'diagnosedOn' => $d(-900), 'color' => '#3f6b3a', 'summary' => 'Synthetic demo condition: quarterly labs and CGM supplies.', 'notes' => $notes(''), 'sortOrder' => 2],
    ];
    foreach ($doc['conditions'] as &$c) { $c['createdAt'] = gmdate('c'); $c['updatedAt'] = gmdate('c'); }
    unset($c);
    $e = function (string $id, string $cond, string $type, string $title, array $values, array $tags = [], string $html = '') use ($notes) {
        return ['id' => $id, 'conditionId' => $cond, 'typeId' => $type, 'title' => $title, 'values' => $values, 'tagIds' => $tags, 'notes' => $notes($html), 'attachments' => [], 'createdAt' => gmdate('c'), 'updatedAt' => gmdate('c')];
    };
    $doc['entries'] = [
        // Knee
        $e('doc-ortho', 'cond-knee', 'doctor', 'Dr. Avery Example (sample)', ['specialty' => 'Orthopedic surgery', 'role' => 'Surgeon', 'practice' => 'Example Bone & Joint Clinic', 'phone' => '555-0100', 'fax' => '555-0101', 'address' => "100 Sample Way, Suite 2\nDemo City, CA 90000", 'portal' => 'https://example.org/portal', 'in_network' => true]),
        $e('doc-pt', 'cond-knee', 'doctor', 'Morgan Placeholder, DPT (sample)', ['specialty' => 'Physical therapy', 'role' => 'Therapist', 'practice' => 'Demo Motion PT', 'phone' => '555-0110', 'in_network' => true]),
        $e('visit-knee-consult', 'cond-knee', 'visit', 'Ortho consult', ['date' => $d(-48), 'time' => '9:30 AM', 'doctor' => 'doc-ortho', 'visit_kind' => 'In person', 'location' => 'Example Bone & Joint Clinic', 'status' => 'Completed', 'outcome' => 'X-ray shows moderate narrowing. Start PT; MRI requested.', 'follow_up' => $d(6)], [], '<p>Bring the PT progress sheet next time.</p>'),
        $e('visit-knee-follow', 'cond-knee', 'visit', 'Ortho follow-up', ['date' => $d(6), 'time' => '10:15 AM', 'doctor' => 'doc-ortho', 'visit_kind' => 'In person', 'location' => 'Example Bone & Joint Clinic', 'status' => 'Scheduled', 'questions' => "Is an injection an option?\nCan I keep running short distances?"], ['tag-ask', 'tag-follow-up']),
        $e('letter-pt-ref', 'cond-knee', 'letter', 'Referral to physical therapy', ['letter_kind' => 'Referral', 'status' => 'Approved', 'issued' => $d(-46), 'valid_until' => $d(44), 'reference' => 'REF-DEMO-0042', 'visits_approved' => 12, 'doctor' => 'doc-ortho', 'visit' => 'visit-knee-consult'], ['tag-paperwork']),
        $e('appeal-mri', 'cond-knee', 'appeal', 'MRI denial — first-level appeal', ['insurer' => 'Sample Health Plan', 'case_number' => 'APL-DEMO-7781', 'status' => 'Submitted', 'opened' => $d(-20), 'deadline' => $d(12), 'amount' => 1850, 'contact' => 'Rep “Taylor” (demo), ext. 204', 'visit' => 'visit-knee-consult', 'call_log' => "Day 1: called, denial reason = conservative care first.\nDay 3: sent PT notes + letter of medical necessity."], ['tag-billing', 'tag-follow-up']),
        $e('supply-brace', 'cond-knee', 'supply', 'Hinged knee brace', ['supplier' => 'Demo DME Supply', 'quantity' => 1, 'status' => 'Delivered', 'ordered' => $d(-40), 'doctor' => 'doc-ortho', 'covered' => true]),
        $e('care-pt-home', 'cond-knee', 'care', 'Home PT exercise set', ['care_kind' => 'PT / OT exercises', 'date' => $d(-1), 'next_due' => $d(1), 'performed_by' => 'Self', 'doctor' => 'doc-pt', 'instructions' => "Quad sets 3×10\nStraight-leg raise 3×10\nHeel slides 2×15", 'done' => true]),
        $e('treat-pt', 'cond-knee', 'treatment', 'Physical therapy course', ['modality' => 'Physical therapy', 'status' => 'Active', 'start' => $d(-42), 'end' => $d(30), 'sessions_planned' => 12, 'sessions_done' => 7, 'doctor' => 'doc-pt', 'facility' => 'Demo Motion PT']),
        // Skin
        $e('doc-derm', 'cond-skin', 'doctor', 'Dr. Jordan Placeholder (sample)', ['specialty' => 'Dermatology', 'role' => 'Specialist', 'practice' => 'Sample Skin Center', 'phone' => '555-0120', 'in_network' => true]),
        $e('doc-radonc', 'cond-skin', 'doctor', 'Dr. Casey Sample (sample)', ['specialty' => 'Radiation oncology', 'role' => 'Specialist', 'practice' => 'Demo Cancer Institute', 'phone' => '555-0130', 'fax' => '555-0131', 'in_network' => true]),
        $e('visit-biopsy', 'cond-skin', 'visit', 'Shave biopsy', ['date' => $d(-75), 'doctor' => 'doc-derm', 'visit_kind' => 'Procedure', 'location' => 'Sample Skin Center', 'status' => 'Completed', 'outcome' => 'Pathology: nodular basal cell carcinoma (synthetic).']),
        $e('visit-rad-consult', 'cond-skin', 'visit', 'Radiation planning check', ['date' => $d(3), 'time' => '2:00 PM', 'doctor' => 'doc-radonc', 'visit_kind' => 'In person', 'location' => 'Demo Cancer Institute, Level B', 'status' => 'Scheduled', 'questions' => 'How long until the skin settles after the last session?'], ['tag-ask']),
        $e('letter-rad-auth', 'cond-skin', 'letter', 'Prior authorization — radiation', ['letter_kind' => 'Prior authorization', 'status' => 'Approved', 'issued' => $d(-30), 'valid_until' => $d(9), 'reference' => 'PA-DEMO-5512', 'visits_approved' => 20, 'doctor' => 'doc-radonc', 'visit' => 'visit-rad-consult'], ['tag-paperwork', 'tag-urgent'], '<p>Expires before the course ends — ask the office to extend.</p>'),
        $e('treat-rad', 'cond-skin', 'treatment', 'Superficial radiation therapy', ['modality' => 'Radiation', 'status' => 'Active', 'start' => $d(-16), 'end' => $d(14), 'sessions_planned' => 20, 'sessions_done' => 11, 'doctor' => 'doc-radonc', 'facility' => 'Demo Cancer Institute']),
        $e('care-wound', 'cond-skin', 'care', 'Scalp wound care', ['care_kind' => 'Wound care', 'date' => $d(0), 'next_due' => $d(1), 'performed_by' => 'Self', 'doctor' => 'doc-radonc', 'instructions' => "Rinse with saline, pat dry.\nThin layer of ointment, non-stick pad.", 'done' => false], ['tag-follow-up']),
        $e('supply-dressings', 'cond-skin', 'supply', 'Non-stick dressing pads (box of 50)', ['supplier' => 'Demo Pharmacy', 'quantity' => 2, 'status' => 'Ordered', 'ordered' => $d(-5), 'reorder' => $d(9), 'doctor' => 'doc-radonc', 'covered' => false]),
        // Diabetes
        $e('doc-endo', 'cond-diabetes', 'doctor', 'Dr. Riley Testcase (sample)', ['specialty' => 'Endocrinology', 'role' => 'Specialist', 'practice' => 'Example Metabolic Clinic', 'phone' => '555-0140', 'in_network' => true]),
        $e('visit-a1c', 'cond-diabetes', 'visit', 'Quarterly A1C review', ['date' => $d(21), 'time' => '8:00 AM', 'doctor' => 'doc-endo', 'visit_kind' => 'Telehealth', 'status' => 'Scheduled'], []),
        $e('visit-a1c-prev', 'cond-diabetes', 'visit', 'Quarterly A1C review', ['date' => $d(-70), 'doctor' => 'doc-endo', 'visit_kind' => 'Telehealth', 'status' => 'Completed', 'outcome' => 'A1C 6.9 (synthetic). Continue current plan.']),
        $e('supply-cgm', 'cond-diabetes', 'supply', 'CGM sensors (3-pack)', ['supplier' => 'Sample Diabetes Direct', 'quantity' => 1, 'status' => 'Delivered', 'ordered' => $d(-12), 'reorder' => $d(16), 'doctor' => 'doc-endo', 'covered' => true]),
        $e('appeal-cgm', 'cond-diabetes', 'appeal', 'CGM coverage', ['insurer' => 'Sample Health Plan', 'case_number' => 'APL-DEMO-3301', 'status' => 'Won', 'opened' => $d(-120), 'amount' => 960, 'call_log' => 'Approved after endocrinology letter.'], ['tag-billing']),
        // New event types (t5u-appts)
        $e('event-wound-worse', 'cond-skin', 'clinical_event', 'Wound edge redder and weeping', ['date' => $d(-2), 'what_changed' => 'More redness around the treated area and clear drainage overnight (synthetic).', 'severity' => 'Moderate', 'visit' => 'visit-rad-consult', 'doctor' => 'doc-radonc', 'resolved' => false], ['tag-ask', 'tag-follow-up']),
        $e('event-knee-swelling', 'cond-knee', 'clinical_event', 'Knee swelling after stairs', ['date' => $d(-9), 'what_changed' => 'Swelling after a long stair day; settled with ice in 24 h.', 'severity' => 'Mild', 'doctor' => 'doc-pt', 'resolved' => true]),
        $e('ins-mri-denied', 'cond-knee', 'insurance_event', 'MRI prior authorization denied', ['date' => $d(-22), 'event_kind' => 'Denied', 'reference' => 'DEN-DEMO-1203', 'amount' => 1850, 'appeal' => 'appeal-mri', 'respond_by' => $d(12)], ['tag-billing']),
        $e('ins-rad-approved', 'cond-skin', 'insurance_event', 'Radiation authorization approved', ['date' => $d(-29), 'event_kind' => 'Approved', 'reference' => 'PA-DEMO-5512', 'letter' => 'letter-rad-auth'], ['tag-paperwork']),
        $e('disrupt-machine', 'cond-skin', 'disruption', 'Radiation machine down for repair', ['date' => $d(-6), 'what_happened' => 'Clinic called: treatment unit offline for maintenance (synthetic).', 'impact' => 'Equipment down', 'rescheduled_to' => $d(2), 'treatment' => 'treat-rad', 'resolved' => false], ['tag-follow-up']),
        $e('disrupt-cancel', 'cond-diabetes', 'disruption', 'Telehealth visit cancelled by clinic', ['date' => $d(-14), 'what_happened' => 'Provider out sick; visit moved.', 'impact' => 'Rescheduled', 'rescheduled_to' => $d(21), 'visit' => 'visit-a1c', 'resolved' => true]),
    ];
    return $doc;
}
