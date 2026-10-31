/**
 * certifications.js — certification levels and specialty courses per organisation.
 *
 * Loaded as a plain <script> before the main app script in index.html, so
 * these top-level consts are shared globals (no module loader needed).
 * Precached by service-worker.js so the app still boots offline.
 */

// Certification level progression lists, keyed by diving certification
// organisation. The "Certification Level" dropdown in the Update Diver
// Credentials modal repopulates from this list whenever the diver
// changes their chosen Certification Organisation.
const CERTIFICATION_LEVELS = {
    "PADI": [
        "Discover Scuba Diving", "Scuba Diver", "Open Water Diver", "Advanced Open Water Diver",
        "Rescue Diver", "Emergency First Response (Prerequisite)", "Divemaster", "Assistant Instructor",
        "Open Water Scuba Instructor", "Master Scuba Diver Trainer", "IDC Staff Instructor",
        "Master Instructor", "Course Director"
    ],
    "SSI": [
        "Try Scuba", "Scuba Diver", "Open Water Diver", "Advanced Adventurer", "Specialty Diver",
        "Advanced Open Water Diver", "Diver Stress & Rescue", "Master Diver", "Dive Guide",
        "Divemaster", "Assistant Instructor", "Open Water Instructor", "Specialty Instructor",
        "Advanced Open Water Instructor", "Master Instructor", "Instructor Trainer", "Instructor Certifier"
    ],
    "SDI": [
        "Discover Scuba", "Scuba Diver", "Open Water Scuba Diver", "Advanced Adventure Diver",
        "Rescue Diver", "Master Scuba Diver Development Program", "Divemaster", "Assistant Instructor",
        "Open Water Instructor", "Specialty Instructor", "Master Instructor", "Instructor Trainer",
        "Course Director"
    ],
    "NAUI": [
        "Skin Diver", "Scuba Diver", "Advanced Scuba Diver", "Rescue Scuba Diver", "Master Scuba Diver",
        "Divemaster", "Assistant Instructor", "Instructor", "Course Director", "Instructor Trainer"
    ]
};

// Real specialty diver course catalogs for each organisation,
// compiled from each org's official course listings (padi.com,
// divessi.com, tdisdi.com/extremesportsscuba.com, nauisa.org) —
// covers each org's standard specialty courses, not every
// dive-shop-specific "distinctive specialty" variant (PADI alone
// has 70+ of those). "Other" is always last, and reveals a free-text
// name field in the modal for anything not in the list.
const SPECIALTY_CERTIFICATIONS = {
    "PADI": [
        "Peak Performance Buoyancy", "Wreck Diver", "Digital Underwater Photographer",
        "Dive Against Debris Specialist", "Boat Diver", "Night Diver", "Deep Diver",
        "Dry Suit Diver", "Enriched Air Diver", "Underwater Navigator", "Full Face Mask Diver",
        "Self-Reliant Diver", "Drift Diver", "Search and Recovery Diver", "Sidemount Rec Diver",
        "Diver Propulsion Vehicle (DPV) Diver", "Equipment Specialist", "Project AWARE Specialist",
        "Coral Reef Conservation", "Emergency Oxygen Provider", "Other"
    ],
    "SSI": [
        "Full Face Mask Diving", "DPV Diving", "Invasive Species Management", "Photo & Video",
        "Recreational Sidemount Diving", "Science of Diving", "Decompression Diving",
        "Perfect Buoyancy", "Boat Diving", "Wreck Diving", "Deep Diving",
        "Waves, Tides & Currents", "Search & Recovery", "Navigation",
        "Night Diving and Limited Visibility", "Equipment Techniques", "Enriched Air Nitrox",
        "Dry Suit Diving", "Stress & Rescue", "Computer Diving", "Gas Blender Nitrox/Trimix", "Other"
    ],
    "SDI": [
        "Advanced Buoyancy Control", "Boat Diver", "Computer Nitrox Diver", "Deep Diver",
        "DPV Diver", "Drift Diver", "Dry Suit Diver", "Full Face Mask Diver",
        "Night/Limited Visibility Diver", "Search and Recovery Diver", "Sidemount Diver",
        "Underwater Navigation", "Underwater Photographer", "Underwater Videographer",
        "Wreck Diver", "Solo Diver", "Other"
    ],
    "NAUI": [
        "Night Diver", "Underwater Environment", "Underwater Photographer",
        "Search and Recovery Diver", "Hunter and Collector", "Wreck Diver (External Survey)",
        "Ice Diver", "Deep Diver", "EANx (Nitrox) Diver", "Underwater Archeologist",
        "Underwater Ecologist: Kelp Forest", "Underwater Ecologist: Coral Reef", "Dry Suit Diver",
        "Boat Diver", "Marine Naturalist", "Shark Ecology", "Other"
    ]
};
