import { CONFIG } from "./config.js";
import { ITEMS } from "./items.js";

// ---------- State ----------
const state = {
  selectedIds: new Set(),
};

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => "$" + Number(n || 0).toFixed(0);

// ---------- Auth (simple bearer token stored in sessionStorage) ----------
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
  renderSummary();
}

function renderItems() {
  const grid = $("#items-grid");
  grid.innerHTML = "";
  for (const item of ITEMS) {
    const el = document.createElement("div");
    el.className = "item-card" + (state.selectedIds.has(item.id) ? " selected" : "");
    el.innerHTML = `
      <div class="title">${escapeHtml(item.name)}</div>
      <div class="sub">${item.ageRange ? escapeHtml(item.ageRange) : "&nbsp;"}</div>
      <div class="price">${fmt(item.price)} CAD</div>
      <ul>${item.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
    `;
    el.addEventListener("click", () => {
      if (state.selectedIds.has(item.id)) state.selectedIds.delete(item.id);
      else state.selectedIds.add(item.id);
      renderItems();
      renderSummary();
    });
    grid.appendChild(el);
  }
}

function renderSummary() {
  const body = $("#summary-body");
  const selected = ITEMS.filter((i) => state.selectedIds.has(i.id));
  if (!selected.length) {
    body.innerHTML = '<tr><td colspan="2" class="muted">No items selected yet.</td></tr>';
  } else {
    body.innerHTML = selected
      .map((i) => `<tr><td>${escapeHtml(i.name)}</td><td class="right">${fmt(i.price)}</td></tr>`)
      .join("");
  }
  const subtotal = selected.reduce((s, i) => s + Number(i.price || 0), 0);
  const delivery = Number($("#deliveryFee").value || 0);
  const deposit = CONFIG.BUSINESS.depositAmount;
  $("#sum-subtotal").textContent = fmt(subtotal);
  $("#sum-delivery").textContent = fmt(delivery);
  $("#sum-deposit").textContent = fmt(deposit);
  $("#sum-total").textContent = fmt(subtotal + delivery + deposit);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Create booking ----------
function validate() {
  const required = ["clientName", "clientEmail", "eventDate", "setupTime", "eventStart", "eventAddress"];
  for (const id of required) {
    const v = $("#" + id).value.trim();
    if (!v) return `Missing: ${id}`;
  }
  if (!state.selectedIds.size) return "Please select at least one item.";
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
    client: {
      name: $("#clientName").value.trim(),
      email: $("#clientEmail").value.trim(),
      phone: $("#clientPhone").value.trim(),
    },
    event: {
      date: $("#eventDate").value,
      setupTime: $("#setupTime").value,
      start: $("#eventStart").value,
      rentalHours: Number($("#rentalHours").value),
      address: $("#eventAddress").value.trim(),
      inCity: $("#inCity").value === "in",
    },
    items: [...state.selectedIds],
    deliveryFee: Number($("#deliveryFee").value || 0),
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
    if (r.status === 401) {
      clearToken();
      showLogin("Session expired. Please sign in again.");
      return;
    }
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
  // recalc summary on delivery fee change
  $("#deliveryFee").addEventListener("input", renderSummary);

  // copy / reset / logout
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
    ["clientName","clientEmail","clientPhone","eventDate","setupTime","eventStart","eventAddress","notes"]
      .forEach((id) => ($("#" + id).value = ""));
    $("#deliveryFee").value = 0;
    $("#rentalHours").value = 4;
    $("#inCity").value = "in";
    $("#result").classList.add("hidden");
    renderItems();
    renderSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("#logout").addEventListener("click", (e) => {
    e.preventDefault();
    clearToken();
    location.reload();
  });

  // login handling
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
  $("#password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#login-btn").click(); });
  $("#generate-btn").addEventListener("click", createBooking);

  // check existing session
  if (await checkToken()) showAdmin();
  else showLogin();
});
