// ─────────────────────────────────────────────────────────────────────────────
// services/seed_agents.js — Database Migrations & Agent Seeder
// ─────────────────────────────────────────────────────────────────────────────
// Run this script using: node services/seed_agents.js
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const AGENT_EMAIL = process.env.AGENT_EMAIL || 'saishivaraju.m2002@gmail.com';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_AGENTS = [
  {
    name: 'Elena Rostova',
    email: 'elena@zorvo.test',
    phone: '+971 50 111 2222',
    coverage_areas: ['Dubai Marina', 'JBR', 'Jumeirah Beach Residence'],
    status: 'active',
    leads_assigned: 0,
    password: 'agent123'
  },
  {
    name: 'Marcus Vance',
    email: 'marcus@zorvo.test',
    phone: '+971 50 333 4444',
    coverage_areas: ['Palm Jumeirah', 'Downtown Dubai', 'Business Bay'],
    status: 'active',
    leads_assigned: 0,
    password: 'agent123'
  },
  {
    name: 'Aisha Rahman',
    email: 'aisha@zorvo.test',
    phone: '+971 50 555 6666',
    coverage_areas: ['Emirates Hills', 'Arabian Ranches', 'Dubai Hills'],
    status: 'active',
    leads_assigned: 0,
    password: 'agent123'
  },
  {
    name: 'Vikram Singh',
    email: 'vikram@zorvo.test',
    phone: '+971 50 777 8888',
    coverage_areas: ['Business Bay', 'DIFC', 'Downtown Dubai'],
    status: 'active',
    leads_assigned: 0,
    password: 'agent123'
  },
  {
    name: 'Chloe Dubois',
    email: 'chloe@zorvo.test',
    phone: '+971 50 999 0000',
    coverage_areas: ['Jumeirah Golf Estates', 'Green Community', 'Sports City'],
    status: 'active',
    leads_assigned: 0,
    password: 'agent123'
  }
];

async function seed() {
  console.log('⏳ Connecting to Supabase...');
  
  // 1. Check if we need to run ALTER TABLE to add password column
  console.log('🔍 Checking team_agents columns...');
  let hasPasswordColumn = false;
  try {
    const { data, error } = await supabase
      .from('team_agents')
      .select('password')
      .limit(1);
    
    if (error && error.message.includes('column "password" does not exist')) {
      console.log('⚠️  Notice: "password" column does not exist on team_agents table yet.');
      console.log('👉 Please execute the following query in your Supabase SQL Editor:');
      console.log('\n   ALTER TABLE team_agents ADD COLUMN IF NOT EXISTS password TEXT DEFAULT \'agent123\';\n');
    } else {
      console.log('✅ "password" column is present in Supabase team_agents table.');
      hasPasswordColumn = true;
    }
  } catch (err) {
    console.error('Column check failed:', err.message);
  }

  // 2. Insert or update the test agents
  console.log('🌱 Seeding active test agents...');
  for (const agent of TEST_AGENTS) {
    try {
      // Check if agent already exists
      const { data: existing } = await supabase
        .from('team_agents')
        .select('*')
        .eq('email', agent.email)
        .maybeSingle();

      const payload = {
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        coverage_areas: agent.coverage_areas,
        team_id: AGENT_EMAIL,
        status: agent.status
      };

      if (hasPasswordColumn) {
        payload.password = agent.password;
      }

      if (existing) {
        console.log(`🔄 Updating agent: ${agent.name} (${agent.email})`);
        const { error } = await supabase
          .from('team_agents')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        console.log(`➕ Inserting agent: ${agent.name} (${agent.email})`);
        const { error } = await supabase
          .from('team_agents')
          .insert([payload]);
        if (error) throw error;
      }
    } catch (err) {
      console.error(`❌ Failed to seed agent ${agent.name}:`, err.message);
    }
  }

  console.log('🏁 Seeding execution complete!');
}

seed();
