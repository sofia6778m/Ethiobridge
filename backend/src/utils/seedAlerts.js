/**
 * Seed a set of demo public alerts across subcities/woredas and severities.
 * Safe to run repeatedly — upserts by a stable title.
 *
 * Usage: node src/utils/seedAlerts.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const PublicAlert = require('../models/PublicAlert');
const { ALERT_CATEGORIES } = require('./alertMetadata');

const SUB_CITIES = [
  { subcityId: null, subcityName: 'Bole', woredas: ['Woreda 01', 'Woreda 02'] },
  { subcityId: null, subcityName: 'Yeka', woredas: ['Woreda 03', 'Woreda 04'] },
  { subcityId: null, subcityName: 'Lemmi Kura', woredas: ['Woreda 05', 'Woreda 06'] },
];

const day = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const seedAlerts = async () => {
  await connectDB();

  const seeds = [
    {
      title: 'የከተማ አቀፍ የከባድ ዝናብ ማስጠንቀቂያ | City-wide Heavy Rainfall Advisory',
      category: 'heavy_rainfall',
      severity: 'warning',
      description:
        'Heavy rainfall is expected across Addis Ababa over the next 48 hours. Expect flash flooding in low-lying areas and traffic disruption. Avoid unnecessary travel and stay away from riverbanks.',
      scope: 'all',
      status: 'active',
      expiresAt: day(2),
    },
    {
      title: '🚨 የእሳት ድንገተኛ ማስጠንቀቂያ | Fire Emergency — Bole, Woreda 01',
      category: 'fire_emergency',
      severity: 'emergency',
      description:
        'A fire has broken out near Bole Woreda 01. Residents in the immediate vicinity should evacuate to the designated assembly point and avoid the area. Emergency services are on site.',
      scope: 'woreda',
      subcityName: 'Bole',
      woredaName: 'Woreda 01',
      status: 'active',
      expiresAt: day(1),
    },
    {
      title: 'የውሃ መቋረጥ ማስታወቂያ | Planned Water Interruption — Yeka, Woreda 03',
      category: 'water_interruption',
      severity: 'information',
      description:
        'Planned maintenance will interrupt water supply in Yeka Woreda 03 on Thursday from 08:00 to 17:00. Please store water in advance.',
      scope: 'woreda',
      subcityName: 'Yeka',
      woredaName: 'Woreda 03',
      status: 'scheduled',
      scheduledAt: day(1),
      expiresAt: day(2),
    },
    {
      title: 'የመንገድ መዘጋት | Road Closure — Lemmi Kura, Woreda 05',
      category: 'road_closure',
      severity: 'warning',
      description:
        'The main road through Lemmi Kura Woreda 05 will be closed for resurfacing from 06:00 to 18:00 this Saturday. Use the alternate route via Bole road. Expect delays.',
      scope: 'woreda',
      subcityName: 'Lemmi Kura',
      woredaName: 'Woreda 05',
      status: 'active',
      expiresAt: day(1),
    },
    {
      title: 'የህብረተሰብ ጤና ማስጠንቀቂያ | Public Health Advisory — Bole',
      category: 'public_health',
      severity: 'warning',
      description:
        'A rise in seasonal influenza cases has been reported in Bole Subcity. Wash hands frequently, avoid crowded spaces when possible, and seek medical care if symptoms develop.',
      scope: 'subcity',
      subcityName: 'Bole',
      status: 'active',
      expiresAt: day(4),
    },
    {
      title: 'የማህበረሰብ ማስታወቂያ | Community Announcement — City-wide cleanup',
      category: 'community_announcement',
      severity: 'information',
      description:
        'Join the city-wide neighborhood cleanup campaign this Saturday from 08:00. Collection trucks will follow the scheduled route. Your participation helps keep Addis Ababa clean.',
      scope: 'all',
      status: 'scheduled',
      scheduledAt: day(1),
      expiresAt: day(3),
    },
  ];

  let created = 0;
  for (const seed of seeds) {
    const existing = await PublicAlert.findOne({ title: seed.title });
    if (existing) continue;
    await PublicAlert.create({
      ...seed,
      safetyInstructions: undefined,
      createdByName: 'EthioBridge Administrator',
      createdByRole: 'admin',
      createdByOrg: 'Addis Ababa City Administration',
      publishedAt: seed.status === 'active' ? new Date() : undefined,
      pinned: seed.severity === 'emergency',
      auditHistory: [{ action: seed.status === 'scheduled' ? 'scheduled' : 'created', userName: 'EthioBridge Administrator', userRole: 'admin', at: new Date() }],
    });
    created += 1;
  }

  console.log(`[seedAlerts] Done. Created ${created} new alert(s). ${ALERT_CATEGORIES.length} categories available.`);
  await mongoose.connection.close();
};

seedAlerts().catch((err) => {
  console.error('[seedAlerts] Failed:', err);
  process.exit(1);
});
