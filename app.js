const SUPABASE_URL = 'https://rixoinxrovrihkzplxeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_v6v7_ibSDj9GvN7FpjKbBw_rC-ImExl';

const slotsEl = document.getElementById('slots');
const form = document.getElementById('booking-form');
const submitBtn = document.getElementById('submit-btn');
const messageEl = document.getElementById('message');

function formatSlot(start, end) {
  const opts = { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true };
  const dateOpts = { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short' };
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('en-SG', dateOpts)} · ${s.toLocaleTimeString('en-SG', opts)} – ${e.toLocaleTimeString('en-SG', opts)}`;
}

async function rpc(fn, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || data?.hint || 'Request failed');
  return data;
}

async function loadSlots() {
  submitBtn.disabled = true;
  slotsEl.innerHTML = '<p class="muted">Loading available slots…</p>';
  try {
    const slots = await rpc('get_available_presentation_slots');
    if (!slots?.length) {
      slotsEl.innerHTML = '<p class="muted">No slots are available.</p>';
      return;
    }
    slotsEl.innerHTML = slots.map(slot => `
      <label class="slot">
        <input type="radio" name="slot_id" value="${slot.id}" required />
        <span>${formatSlot(slot.start_at, slot.end_at)}</span>
      </label>
    `).join('');
    slotsEl.querySelectorAll('input[name="slot_id"]').forEach(radio => {
      radio.addEventListener('change', () => { submitBtn.disabled = false; });
    });
  } catch (err) {
    slotsEl.innerHTML = '<p class="message error">Booking service is not ready yet.</p>';
    console.error(err);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const studentName = document.getElementById('student-name').value.trim();
  const groupNo = Number(document.getElementById('group-no').value);
  const chosen = form.querySelector('input[name="slot_id"]:checked');
  if (!studentName || !groupNo || !chosen) return;

  submitBtn.disabled = true;
  messageEl.className = 'message';
  messageEl.textContent = 'Booking…';

  try {
    const result = await rpc('book_presentation_slot', {
      p_slot_id: Number(chosen.value),
      p_group_no: groupNo,
      p_student_name: studentName
    });
    const record = Array.isArray(result) ? result[0] : result;
    messageEl.className = 'message success';
    messageEl.textContent = `Booked successfully for Group ${groupNo}: ${formatSlot(record.start_at, record.end_at)}.`;
    form.reset();
    await loadSlots();
  } catch (err) {
    messageEl.className = 'message error';
    messageEl.textContent = err.message;
    await loadSlots();
  }
});

loadSlots();
