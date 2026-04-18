import { CONFIG } from "./config.js";
import { ITEMS } from "./items.js";

// ---------- State ----------
const state = {
  selectedIds: new Set(),
  priceOverrides: {},   // { itemId: price }
  customItems: [],      // [{ id, name, price }]
};

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => "$" + Number(n || 0).toFixed(0);

// ---------- Auth ----------
function getToken() { return sessionStorage.getItem("bb_admin_token"); }
function setToken(t) { sessionStorage.setItem("bb_admin_token", t); }
function clearToken() { sessionStorage.removeItem("bb_admin_token"); }

async function login(password) {
  const r = await fetch(`${CONFIG.WORKER_URL}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Login failed");
  const { token } = await r.json();
  setToken(token);
}

async function checkToken() {
  const t = getToken();
  if (!t) return false;
  const r = await fetch(`${CONFIG.WORKER_URL}/api/admin/check`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  return r.ok;
}

// ---------- UI ----------
function showLogin(err) {
  $("#login-view").classList.remove("hidden");
  $("#admin-view").classList.add("hidden");
  if (err) {
    const el = $("#login-error");
    el.textContent = err;
    el.classList.remove("hidden");
  }
}

function showAdmin() {
  $("#login-view").classList.add("hidden");
  $("#admin-view").classList.remove("hidden");
  renderItems();
  renderCustomItems();
  renderSummary();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function getItemPrice(item) {
  return state.priceOverrides[item.id] !== undefined
    ? state.priceOverrides[item.id]
    : Number(item.price || 0);
}

function renderItems() {
  const grid = $("#items-grid");
  grid.innerHTML = "";
  for (const item of ITEMS) {
    const selected = state.selectedIds.has(item.id);
    const price = getItemPrice(item);
    const el = document.createElement("div");
    el.className = "item-card" + (selected ? " selected" : "");
    el.innerHTML = `
      <div class="title">${escapeHtml(item.name)}</div>
      <div class="sub">${item.ageRange ? escapeHtml(item.ageRange) : "&nbsp;"}</div>
      <ul>${item.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
      ${selected ? `
        <div style="margin-top:8px;" onclick="event.stopPropagation()">
          <label style="font-size:0.8rem;font-weight:600;">Price (CAD)</label>
          <input type="number" class="price-input" data-id="${escapeHtml(item.id)}"
            value="${price}" min="0" step="1"
            style="width:100%;padding:4px 8px;font-size:0.9rem;border:1px solid var(--border);border-radius:6px;">
        </div>` : `<div class="price">${fmt(price)} CAD</div>`}
    `;
    el.addEventListener("click", () => {
      if (state.selectedIds.has(item.id)) {
        state.selectedIds.delete(item.id);
        delete state.priceOverrides[item.id];
      } else {
        state.selectedIds.add(item.id);
      }
      renderItems();
      renderSummary();
    });
    grid.appendChild(el);
  }

  // Attach price input listeners
  grid.querySelectorAll(".price-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const id = e.target.dataset.id;
      state.priceOverrides[id] = Number(e.target.value || 0);
      renderSummary();
    });
  });
}

function renderCustomItems() {
  const list = $("#custom-items-list");
  if (!state.customItems.length) { list.innerHTML = ""; return; }
  list.innerHTML = state.customItems.map((ci, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="flex:1">${escapeHtml(ci.name)}</span>
      <span style="font-weight:600;">${fmt(ci.price)}</span>
      <button class="btn ghost" style="padding:4px 10px;font-size:0.8rem;" data-idx="${i}">Remove</button>
    </div>
  `).join("");
  list.querySelectorAll("button[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.customItems.splice(Number(btn.dataset.idx), 1);
      renderCustomItems();
      renderSummary();
    });
  });
}

function renderSummary() {
  const body = $("#summary-body");
  const selected = ITEMS.filter((i) => state.selectedIds.has(i.id));
  const allItems = [
    ...selected.map((i) => ({ name: i.name, price: getItemPrice(i) })),
    ...state.customItems,
  ];

  if (!allItems.length) {
    body.innerHTML = '<tr><td colspan="2" class="muted">No items selected yet.</td></tr>';
  } else {
    body.innerHTML = allItems
      .map((i) => `<tr><td>${escapeHtml(i.name)}</td><td class="right">${fmt(i.price)}</td></tr>`)
      .join("");
  }

  const subtotal = allItems.reduce((s, i) => s + Number(i.price || 0), 0);
  const delivery = Number($("#deliveryFee").value || 0);
  const deposit = CONFIG.BUSINESS.depositAmount;
  $("#sum-subtotal").textContent = fmt(subtotal);
  $("#sum-delivery").textContent = fmt(delivery);
  $("#sum-deposit").textContent = fmt(deposit);
  $("#sum-total").textContent = fmt(subtotal + delivery + deposit);
}

// ---------- Create booking ----------
function validate() {
  if (!state.selectedIds.size && !state.customItems.length) return "Please select at least one item.";
  return null;
}

async function createBooking() {
  const err = validate();
  const errBox = $("#admin-error");
  errBox.classList.add("hidden");
  if (err) {
    errBox.textContent = err;
    errBox.classList.remove("hidden");
    return;
  }
  const payload = {
    client: {},
    event: {},
    items: [...state.selectedIds],
    priceOverrides: { ...state.priceOverrides },
    customItems: state.customItems.map((ci) => ({ ...ci })),
    deliveryFee: Number($("#deliveryFee").value || 0),
    inCity: $("#inCity").value === "in",
    deposit: CONFIG.BUSINESS.depositAmount,
    notes: $("#notes").value.trim(),
  };
  try {
    $("#generate-btn").disabled = true;
    $("#generate-btn").textContent = "Generating…";
    const r = await fetch(`${CONFIG.WORKER_URL}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });
    if (r.status === 401) { clearToken(); showLogin("Session expired. Please sign in again."); return; }
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Server error");
    const { id } = await r.json();
    const link = `${CONFIG.SITE_URL}/sign.html?id=${encodeURIComponent(id)}`;
    $("#result-link-text").textContent = link;
    $("#open-btn").href = link;
    $("#result").classList.remove("hidden");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  } catch (e) {
    errBox.textContent = "Couldn't generate link: " + e.message;
    errBox.classList.remove("hidden");
  } finally {
    $("#generate-btn").disabled = false;
    $("#generate-btn").textContent = "Generate link for client";
  }
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  $("#deliveryFee").addEventListener("input", renderSummary);
  $("#inCity").addEventListener("change", renderSummary);

  $("#add-custom-btn").addEventListener("click", () => {
    const name = $("#custom-name").value.trim();
    const price = Number($("#custom-price").value || 0);
    if (!name) { alert("Please enter an item name."); return; }
    state.customItems.push({ id: "custom-" + Date.now(), name, price });
    $("#custom-name").value = "";
    $("#custom-price").value = "";
    renderCustomItems();
    renderSummary();
  });

  $("#copy-btn").addEventListener("click", async () => {
    const text = $("#result-link-text").textContent;
    try {
      await navigator.clipboard.writeText(text);
      $("#copy-btn").textContent = "Copied!";
      setTimeout(() => ($("#copy-btn").textContent = "Copy link"), 1500);
    } catch {
      alert("Copy failed — select the link manually.");
    }
  });

  $("#new-btn").addEventListener("click", () => {
    state.selectedIds = new Set();
    state.priceOverrides = {};
    state.customItems = [];
    $("#notes").value = "";
    $("#deliveryFee").value = 0;
    $("#inCity").value = "in";
    $("#result").classList.add("hidden");
    renderItems();
    renderCustomItems();
    renderSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("#logout").addEventListener("click", (e) => {
    e.preventDefault();
    clearToken();
    location.reload();
  });

  $("#login-btn").addEventListener("click", async () => {
    const pw = $("#password").value;
    $("#login-error").classList.add("hidden");
    if (!pw) return;
    $("#login-btn").disabled = true;
    $("#login-btn").textContent = "Signing in…";
    try {
      await login(pw);
      showAdmin();
    } catch (e) {
      showLogin(e.message || "Incorrect password.");
    } finally {
      $("#login-btn").disabled = false;
      $("#login-btn").textContent = "Sign in";
    }
  });

  $("#load-orders-btn").addEventListener("click", async () => {
    const btn = $("#load-orders-btn");
    btn.disabled = true;
    btn.textContent = "Loading…";
    try {
      const r = await fetch(`${CONFIG.WORKER_URL}/api/orders`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) throw new Error("Failed to load orders");
      const orders = await r.json();
      const list = $("#orders-list");
      if (!orders.length) {
        list.innerHTML = '<p class="muted small">No orders yet.</p>';
      } else {
        list.innerHTML = `
          <table class="summary-table" style="width:100%">
            <thead><tr>
              <th>ID</th><th>Date</th><th>Client</th><th>Event date</th><th>Status</th><th class="right">Actions</th>
            </tr></thead>
            <tbody>
              ${orders.map((o) => `
                <tr>
                  <td><span class="small muted">${escapeHtml(o.id)}</span></td>
                  <td class="small">${escapeHtml(o.createdAt?.slice(0,10) || "—")}</td>
                  <td>${escapeHtml(o.clientName)}<br><span class="muted small">${escapeHtml(o.clientEmail)}</span></td>
                  <td>${escapeHtml(o.eventDate)}</td>
                  <td><span style="color:${o.status === 'signed' ? '#16a34a' : '#d97706'};font-weight:600;">${o.status === 'signed' ? '✅ Signed' : '⏳ Pending'}</span></td>
                  <td class="right">
                    ${o.pdfUrl ? `<a href="${escapeHtml(o.pdfUrl)}" class="btn secondary" style="font-size:0.8rem;padding:4px 10px;" target="_blank">Download PDF</a>` : '—'}
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>`;
      }
    } catch (e) {
      $("#orders-list").innerHTML = `<p class="muted small" style="color:red;">${e.message}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Refresh orders";
    }
  });

  $("#password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#login-btn").click(); });
  $("#generate-btn").addEventListener("click", createBooking);

  if (await checkToken()) showAdmin();
  else showLogin();
});
