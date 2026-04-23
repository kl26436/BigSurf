
// ═══════════════════════════════════════════════════════════════
// Equipment Migration Debug Script — paste into browser console
// Run at: your-app-url/?debug
// Requires: signed in, equipment collection loaded
// ═══════════════════════════════════════════════════════════════

window.debugEquipmentMigration = async function() {
  const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const db = window.db || window.firebaseDb;
  const userId = window.AppState?.userId;
  if (!db || !userId) { console.error('❌ Not signed in or db not ready'); return; }

  console.log('📦 Loading equipment from Firestore...');
  const snap = await getDocs(collection(db, 'users', userId, 'equipment'));
  const equipment = [];
  snap.forEach(doc => equipment.push({ id: doc.id, ...doc.data() }));
  console.log('Found ' + equipment.length + ' equipment records');

  // Paste the results from the Node analysis as a lookup
  const migrationPreview = [
  {
    "id": "equipment_1764535392282_mdygdtyp0",
    "oldName": "Edition 80",
    "newName": "gym80",
    "tier": 3,
    "newBrand": "gym80",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Brand alias (\"edition 80\")"
  },
  {
    "id": "equipment_1764535997377_lcmq96xry",
    "oldName": "Panatta Fit Evo — Abdominal Crunch",
    "newName": "Panatta Fit Evo — Abdominal Crunch",
    "tier": 1,
    "newBrand": "Panatta",
    "newLine": "Fit Evo",
    "newFunction": "Abdominal Crunch",
    "newType": "Selectorized",
    "aliasNote": null
  },
  {
    "id": "equipment_1764651869494_iesdoyja4",
    "oldName": "Arsenal Strength M-1 — Lat Pulldown",
    "newName": "Arsenal Strength M-1 — Lat Pulldown",
    "tier": 1,
    "newBrand": "Arsenal Strength",
    "newLine": "M-1",
    "newFunction": "Lat Pulldown",
    "newType": "Selectorized",
    "aliasNote": null
  },
  {
    "id": "equipment_1764652432752_merrlemma",
    "oldName": "Gymleco",
    "newName": "Gymleco",
    "tier": 3,
    "newBrand": "Gymleco",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Brand detected in function field (\"gymleco\")"
  },
  {
    "id": "equipment_1764653043376_1yyn85knm",
    "oldName": "M-Torture Plated",
    "newName": "Newtech M-Torture",
    "tier": 3,
    "newBrand": "Newtech",
    "newLine": "M-Torture",
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Line→Brand restructured (\"m-torture\")"
  },
  {
    "id": "equipment_1764653468583_sm9r0rpds",
    "oldName": "Arsenal Strength — M1",
    "newName": "Arsenal Strength",
    "tier": 3,
    "newBrand": "Arsenal Strength",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1764653656342_p7v6wfu6j",
    "oldName": "Panatta — Evo Fit",
    "newName": "Panatta",
    "tier": 3,
    "newBrand": "Panatta",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1764911678371_7dp3vs8il",
    "oldName": "45 Degree Mega Mass",
    "newName": "MegaMass — 45 Degree Linear Iso Row Pro",
    "tier": 2,
    "newBrand": "MegaMass",
    "newLine": null,
    "newFunction": "45 Degree Linear Iso Row Pro",
    "newType": "Plate-Loaded",
    "aliasNote": "Brand detected in function field (\"mega mass\")"
  },
  {
    "id": "equipment_1764912503296_2ylw30tpi",
    "oldName": "Panatta Fit Evo — Lateral Raise",
    "newName": "Panatta Fit Evo — Lateral Raise",
    "tier": 1,
    "newBrand": "Panatta",
    "newLine": "Fit Evo",
    "newFunction": "Lateral Raise",
    "newType": "Selectorized",
    "aliasNote": null
  },
  {
    "id": "equipment_1764913348792_8ic4g9hhi",
    "oldName": "Panatta Fit Evo — Lower Back",
    "newName": "Panatta Fit Evo — Lower Back",
    "tier": 1,
    "newBrand": "Panatta",
    "newLine": "Fit Evo",
    "newFunction": "Lower Back",
    "newType": "Selectorized",
    "aliasNote": null
  },
  {
    "id": "equipment_1764913632354_vvs72260f",
    "oldName": "Roger’s Athletic",
    "newName": "Rogers Athletic Pendulum",
    "tier": 3,
    "newBrand": "Rogers Athletic",
    "newLine": "Pendulum",
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Brand corrected (\"roger’s athletic\")"
  },
  {
    "id": "equipment_1764914369381_j6dhoejpl",
    "oldName": "Gymleco Bicep Curl",
    "newName": "Gymleco — Biceps Curl",
    "tier": 2,
    "newBrand": "Gymleco",
    "newLine": null,
    "newFunction": "Biceps Curl",
    "newType": "Selectorized",
    "aliasNote": "Brand detected in function field (\"gymleco\")"
  },
  {
    "id": "equipment_1764980833817_hvhdpbpf9",
    "oldName": "Hammer Strength",
    "newName": "Hammer Strength",
    "tier": 3,
    "newBrand": "Hammer Strength",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1764980881285_9fjj3p9yi",
    "oldName": "Matrix",
    "newName": "Matrix",
    "tier": 3,
    "newBrand": "Matrix",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1764980894471_nu4yncpy6",
    "oldName": "Hamemr Strength",
    "newName": "Hammer Strength",
    "tier": 3,
    "newBrand": "Hammer Strength",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Typo corrected (\"hamemr strength\")"
  },
  {
    "id": "equipment_1764981479058_k1c9e5g1i",
    "oldName": "Panatta Fit Evo — Dips Press",
    "newName": "Panatta Fit Evo — Dips Press",
    "tier": 1,
    "newBrand": "Panatta",
    "newLine": "Fit Evo",
    "newFunction": "Dips Press",
    "newType": "Selectorized",
    "aliasNote": null
  },
  {
    "id": "equipment_1764981612543_no08bwe6t",
    "oldName": "Arsenal Strength",
    "newName": "Arsenal Strength",
    "tier": 3,
    "newBrand": "Arsenal Strength",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1764994305329_2b6e35f3k",
    "oldName": "Panatta Fit Evo — Lat Pulldown",
    "newName": "Panatta Fit Evo — Lat Pulldown",
    "tier": 1,
    "newBrand": "Panatta",
    "newLine": "Fit Evo",
    "newFunction": "Lat Pulldown",
    "newType": "Selectorized",
    "aliasNote": null
  },
  {
    "id": "equipment_1764994700527_9v33bxncs",
    "oldName": "Panatta — Cable",
    "newName": "Panatta",
    "tier": 3,
    "newBrand": "Panatta",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1764994717476_q7jgasgt2",
    "oldName": "Arsenal Cable",
    "newName": "Arsenal Strength",
    "tier": 3,
    "newBrand": "Arsenal Strength",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Brand detected from name (\"arsenal cable\")"
  },
  {
    "id": "equipment_1764995125445_ur5fkjng4",
    "oldName": "Atlantis Plated",
    "newName": "Atlantis Strength",
    "tier": 3,
    "newBrand": "Atlantis Strength",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Brand alias (\"atlantis\")"
  },
  {
    "id": "equipment_1764996014741_br3s3jmji",
    "oldName": "Pendulum Glute Ham",
    "newName": "Rogers Athletic Pendulum — Reverse Glute-Ham",
    "tier": 2,
    "newBrand": "Rogers Athletic",
    "newLine": "Pendulum",
    "newFunction": "Reverse Glute-Ham",
    "newType": "Plate-Loaded",
    "aliasNote": "Line→Brand restructured (\"pendulum\")"
  },
  {
    "id": "equipment_1764997386405_mkykmgto2",
    "oldName": "Panatta Fit Evo — Calf Machine",
    "newName": "Panatta Fit Evo — Calf Machine",
    "tier": 1,
    "newBrand": "Panatta",
    "newLine": "Fit Evo",
    "newFunction": "Calf Machine",
    "newType": "Selectorized",
    "aliasNote": null
  },
  {
    "id": "equipment_1764997497864_y4edoc5yy",
    "oldName": "Panatta — Circular Cable",
    "newName": "Panatta — Circular",
    "tier": 3,
    "newBrand": "Panatta",
    "newLine": null,
    "newFunction": "Circular",
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1764997519495_6jpg0wiuz",
    "oldName": "Mega Mass Super Row",
    "newName": "MegaMass — Plate-Loaded Row",
    "tier": 2,
    "newBrand": "MegaMass",
    "newLine": null,
    "newFunction": "Plate-Loaded Row",
    "newType": "Plate-Loaded",
    "aliasNote": "Brand detected in function field (\"mega mass\")"
  },
  {
    "id": "equipment_1764997555473_p7ent5one",
    "oldName": "Panatta FreeWeight HP — Row",
    "newName": "Panatta FreeWeight HP — Row",
    "tier": 1,
    "newBrand": "Panatta",
    "newLine": "FreeWeight HP",
    "newFunction": "Row",
    "newType": "Plate-Loaded",
    "aliasNote": null
  },
  {
    "id": "equipment_1764997662841_6jqcvfzdm",
    "oldName": "Panatta FreeWeight Special — Super Rowing",
    "newName": "Panatta FreeWeight Special — Super Rowing",
    "tier": 1,
    "newBrand": "Panatta",
    "newLine": "FreeWeight Special",
    "newFunction": "Super Rowing",
    "newType": "Plate-Loaded",
    "aliasNote": null
  },
  {
    "id": "equipment_1764997935132_ln6souorz",
    "oldName": "Panatta — Deltoid Cable",
    "newName": "Panatta — Deltoid",
    "tier": 3,
    "newBrand": "Panatta",
    "newLine": null,
    "newFunction": "Deltoid",
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1765000244380_sxallc8i2",
    "oldName": "M-Torture",
    "newName": "Newtech M-Torture",
    "tier": 3,
    "newBrand": "Newtech",
    "newLine": "M-Torture",
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Line→Brand restructured (\"m-torture\")"
  },
  {
    "id": "equipment_1765001137479_j4dl6g5mi",
    "oldName": "Hoist",
    "newName": "Hoist",
    "tier": 3,
    "newBrand": "Hoist",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1765001449011_nk49bt9g7",
    "oldName": "Newtech",
    "newName": "Newtech",
    "tier": 3,
    "newBrand": "Newtech",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1765483894676_rd3q1mk3t",
    "oldName": "Mega Mass",
    "newName": "MegaMass",
    "tier": 3,
    "newBrand": "MegaMass",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Brand detected in function field (\"mega mass\")"
  },
  {
    "id": "equipment_1765755705913_v4gywzq4a",
    "oldName": "Hammer Strength — Cable",
    "newName": "Hammer Strength",
    "tier": 3,
    "newBrand": "Hammer Strength",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1766033284955_quzqevt8d",
    "oldName": "Precor",
    "newName": "Precor",
    "tier": 3,
    "newBrand": "Precor",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1766434558322_uma9o323j",
    "oldName": "Life Fitness",
    "newName": "Life Fitness",
    "tier": 3,
    "newBrand": "Life Fitness",
    "newLine": null,
    "newFunction": null,
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1766435230679_vjhygini7",
    "oldName": "Magnum Plated",
    "newName": "Matrix Magnum",
    "tier": 3,
    "newBrand": "Matrix",
    "newLine": "Magnum",
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Brand→Line restructured (\"magnum\")"
  },
  {
    "id": "equipment_1766436596090_y88xi4kii",
    "oldName": "Ultra Triceps Extension",
    "newName": "Matrix Ultra — Triceps Extension",
    "tier": 1,
    "newBrand": "Matrix",
    "newLine": "Ultra",
    "newFunction": "Triceps Extension",
    "newType": "Selectorized",
    "aliasNote": "Brand→Line restructured (\"ultra\")"
  },
  {
    "id": "equipment_1766513776250_qx6lprz4g",
    "oldName": "Ultra",
    "newName": "Matrix Ultra",
    "tier": 3,
    "newBrand": "Matrix",
    "newLine": "Ultra",
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Brand→Line restructured (\"ultra\")"
  },
  {
    "id": "equipment_1766600111006_x4mxaf6gi",
    "oldName": "Dumbell",
    "newName": "Dumbell",
    "tier": 0,
    "newBrand": "Unknown",
    "newLine": null,
    "newFunction": "Dumbell",
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1767316797745_iq1cuqxas",
    "oldName": "M-Torture High Row",
    "newName": "Newtech M-Torture — High Row",
    "tier": 1,
    "newBrand": "Newtech",
    "newLine": "M-Torture",
    "newFunction": "High Row",
    "newType": "Plate-Loaded",
    "aliasNote": "Line→Brand restructured (\"m-torture\")"
  },
  {
    "id": "equipment_1768887665752_ul8wcone9",
    "oldName": "Panatta Fit Evo — Leg Press",
    "newName": "Panatta Fit Evo — Leg Press",
    "tier": 1,
    "newBrand": "Panatta",
    "newLine": "Fit Evo",
    "newFunction": "Leg Press",
    "newType": "Selectorized",
    "aliasNote": null
  },
  {
    "id": "equipment_1769144789547_jfq2jb3tn",
    "oldName": "Arsenal Strength Reloaded — Power Squat",
    "newName": "Arsenal Strength Reloaded — Power Squat",
    "tier": 1,
    "newBrand": "Arsenal Strength",
    "newLine": "Reloaded",
    "newFunction": "Power Squat",
    "newType": "Plate-Loaded",
    "aliasNote": null
  },
  {
    "id": "equipment_1769750711656_uj0wpteop",
    "oldName": "Pendulum",
    "newName": "Rogers Athletic Pendulum",
    "tier": 3,
    "newBrand": "Rogers Athletic",
    "newLine": "Pendulum",
    "newFunction": null,
    "newType": "Other",
    "aliasNote": "Line→Brand restructured (\"pendulum\")"
  },
  {
    "id": "equipment_1769751917157_h8i3y108z",
    "oldName": "Panatta — Master Glutes",
    "newName": "Panatta — Master Glutes",
    "tier": 3,
    "newBrand": "Panatta",
    "newLine": null,
    "newFunction": "Master Glutes",
    "newType": "Other",
    "aliasNote": null
  },
  {
    "id": "equipment_1770419954125_ulylazkmb",
    "oldName": "Rouge — Curl Bar",
    "newName": "Rogue Barbells — EZ Curl Bar",
    "tier": 2,
    "newBrand": "Rogue",
    "newLine": "Barbells",
    "newFunction": "EZ Curl Bar",
    "newType": "Barbell",
    "aliasNote": "Typo corrected (\"rouge\")"
  }
];

  console.log('\n═══════════════════════════════════════════');
  console.log('  Equipment Migration Dry Run');
  console.log('═══════════════════════════════════════════');

  const tierEmoji = ['⚪', '🟢', '🟡', '🔵'];
  for (const preview of migrationPreview) {
    const eq = equipment.find(e => e.id === preview.id);
    if (!eq) { console.warn('⚠️ Record not found:', preview.id); continue; }
    const changed = eq.name !== preview.newName;
    console.log(tierEmoji[preview.tier] + ' ' + (changed ? eq.name + ' → ' + preview.newName : eq.name + ' (unchanged)'));
    if (eq.equipmentType !== preview.newType) console.log('   type: ' + eq.equipmentType + ' → ' + preview.newType);
    if (preview.aliasNote) console.log('   📝 ' + preview.aliasNote);
  }

  console.log('\n✅ This is a DRY RUN — no changes made.');
  console.log('Run window.executeEquipmentMigration() to apply.');
  return migrationPreview;
};

console.log('🔧 Equipment migration debug loaded. Run: window.debugEquipmentMigration()');
