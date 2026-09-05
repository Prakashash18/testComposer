const SUPABASE_URL = 'https://qobfgevzgnluctagsybj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zhF0-KqttHXbpYDTDKbNxw_QV5mJHsh';

const slotsEl = document.getElementById('slots');
const form = document.getElementById('booking-form');
const submitBtn = document.getElementById('submit-btn');
const messageEl = document.getElementById('message');

const dateFormatter = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

const timeFormatter = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

function formatSlot(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return {
    date: dateFormatter.format(s),
    time: `${timeFormatter.format(s)} – ${timeFormatter.format(e)}`
  };
}

function hasValidConfig() {
  return SUPABASE_KEY.startsWith('sb_publishable_') || SUPABASE_KEY.startsWith('eyJ');
}

async function rpc(fn, body = {}) {
  if (!hasValidConfig()) {
    throw new Error('The booking database connection is still being configured.');
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY
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

    slotsEl.innerHTML = slots.map(slot => {
      const formatted = formatSlot(slot.start_at, slot.end_at);
      return `
        <label class="slot">
          <input type="radio" name="slot_id" value="${slot.id}" required />
          <span class="slot-copy">
            <span class="slot-date">${formatted.date}</span>
            <span class="slot-time">${formatted.time}</span>
          </span>
        </label>
      `;
    }).join('');

    slotsEl.querySelectorAll('input[name="slot_id"]').forEach(radio => {
      radio.addEventListener('change', () => { submitBtn.disabled = false; });
    });
  } catch (err) {
    slotsEl.innerHTML = `<p class="message error">${err.message}</p>`;
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
    const rawResult = await rpc('book_presentation_slot', {
      p_slot_id: Number(chosen.value),
      p_group_no: groupNo,
      p_student_name: studentName
    });

    const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
    if (!result?.ok) {
      throw new Error(result?.message || 'Unable to book this slot.');
    }

    const formatted = formatSlot(result.start_at, result.end_at);
    messageEl.className = 'message success';
    messageEl.textContent = `Booked successfully for Group ${groupNo}: ${formatted.date}, ${formatted.time}.`;
    form.reset();
    await loadSlots();
  } catch (err) {
    messageEl.className = 'message error';
    messageEl.textContent = err.message;
    await loadSlots();
  }
});

loadSlots();
