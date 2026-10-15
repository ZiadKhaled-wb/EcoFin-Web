import type { CreditProfile, Survey } from '@ziadkhaled-wb/contracts';
import { USER_ID } from '@/test/authFixtures';

/** Test data for the R05 survey pages (not shipped: imported by tests only). */
export const SURVEY_ID = 'a0750000-0000-4000-8000-0000000000a1';
export const CUSTOMER_ID = 'a0750000-0000-4000-8000-0000000000c1';
export const OTHER_EMPLOYEE = 'a0750000-0000-4000-8000-0000000000e2';
const timestamp = '2026-10-16T09:00:00.000Z';

export const survey = (over: Partial<Survey> = {}): Survey => ({
  id: SURVEY_ID,
  status: 'assigned',
  visit_type: 'home',
  customer: {
    id: CUSTOMER_ID,
    full_name: 'Ahmed Ali Hassan',
    phones: ['01001234567'],
    address: '12 Nile St',
    city: 'Giza',
  },
  assigned_to: { id: USER_ID, full_name: 'Test User' },
  instructions: 'Ask for the electricity bill',
  due_date: '2026-10-20',
  scores: {},
  checklist: {},
  notes: null,
  gps: null,
  gps_low_accuracy: false,
  survey_score: null,
  photos_count: 0,
  submitted_at: null,
  decided_by: null,
  decided_at: null,
  decision_note: null,
  valid_until: null,
  created_by: { id: OTHER_EMPLOYEE, full_name: 'Branch Manager' },
  created_at: timestamp,
  updated_at: timestamp,
  ...over,
});

export const ALL_SCORES = {
  housing_quality: 8,
  neighbourhood: 7,
  income_stability: 6,
  job_status: 9,
  property_ownership: 5,
  overall_impression: 7,
};
export const ALL_CHECKS = {
  met_customer: true,
  address_matches: true,
  id_original_seen: true,
  neighbours_confirm: false,
  utility_bill_seen: true,
  workplace_confirmed: true,
};
export const GPS = {
  lat: 30.0444,
  lng: 31.2357,
  gps_accuracy_m: 12,
  client_captured_at: '2026-10-16T10:00:00.000Z',
};

/** A submitted survey with every answer, scored 70. */
export const submittedSurvey = (over: Partial<Survey> = {}): Survey =>
  survey({
    status: 'submitted',
    scores: ALL_SCORES,
    checklist: ALL_CHECKS,
    notes: 'Clean flat, owner-occupied',
    gps: GPS,
    survey_score: 70,
    photos_count: 2,
    submitted_at: '2026-10-16T10:05:00.000Z',
    assigned_to: { id: OTHER_EMPLOYEE, full_name: 'Collector One' },
    ...over,
  });

export const creditProfile = (over: Partial<CreditProfile> = {}): CreditProfile => ({
  customer_id: CUSTOMER_ID,
  status: 'active',
  credit_limit: '0.00',
  suggested_limit: null,
  exposure: '0.00',
  available: '0.00',
  over_limit_by: '0.00',
  score: 0,
  min_score: 50,
  components: [
    { key: 'guarantors', weight: 40, value: 0, points: 0 },
    { key: 'income', weight: 30, value: 0, points: 0 },
    { key: 'residence', weight: 20, value: 0, points: 0 },
    { key: 'identity', weight: 10, value: 0, points: 0 },
  ],
  behaviour: {
    due_lines: 0,
    on_time_pct: null,
    max_days_late: null,
    current_overdue_amount: '0.00',
    overdue_lines: 0,
    open_contracts: 0,
    completed_contracts: 0,
  },
  store_credit: '0.00',
  limit_history: [],
  latest_survey: null,
  ...over,
});
