import { CONFIG } from "./config.js";
import { AGREEMENT_SECTIONS } from "./agreement.js";
import { AGREEMENT_SECTIONS_PICKUP } from "./agreement-pickup.js";
import { getItemById } from "./items.js";
import { buildAgreementPDF } from "./pdf.js?v=3";

const $ = (s) => document.querySelector(s);
const money = (n) => "$" + Number(n || 0).toFixed(0);
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let order = null;
let signaturePad = null;


function getOrderId() {
  const u = new URL(window.location.href);
  return u.searchParams.get("id");
}

function show(id) {
  ["loading", "not-found", "already-signed", "view", "submitting"].forEach((k) =>
    $("#" + k).classList.toggle("hidden", k !== id)
  );
}

function getItemPrice(item) {
  if (order.priceOverrides && order.priceOverrides[item.id] !== undefined) {
    return Number(order.priceOverrides[item.id]);
  }
  return Number(item.price || 0);
}

function renderItems() {
  const tbody = $("#items-body");
  let subtotal = 0;
  const rows = [];

  // Catalog items
  for (const id of (order.items || [])) {
    const it = getItemById(id);
    if (!it) continue;
    const price = getItemPrice(it);
    subtotal += price;
    rows.push(`
      <tr>
        <td>
          <strong>${escapeHtml(it.name)}</strong>
          ${it.ageRange ? `<br><span class="muted small">${escapeHtml(it.ageRange)}</span>` : ""}
          <ul style="margin:6px 0 0 0;padding-left:18px;font-size:0.85rem;color:#555;">
            ${it.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
          </ul>
        </td>
        <td class="right" style="vertical-align:top;">${money(price)}</td>
      </tr>`);
  }

  // Custom items
  for (const ci of (order.customItems || [])) {
    subtotal += Number(ci.price || 0);
    rows.push(`
      <tr>
        <td><strong>${escapeHtml(ci.name)}</strong></td>
        <td class="right">${money(ci.price)}</td>
      </tr>`);
  }

  tbody.innerHTML = rows.join("") || '<tr><td colspan="2" class="muted">No items.</td></tr>';

  const delivery = Number(order.deliveryFee || 0);
  const deposit  = Number(order.deposit || CONFIG.BUSINESS.depositAmount);
  $("#f-subtotal").textContent = money(subtotal);
  $("#f-delivery").textContent = money(delivery);
  $("#f-deposit").textContent  = money(deposit);
  $("#f-total").textContent    = money(subtotal + delivery + deposit);
}

function renderAgreement() {
  const sections = order.agreementType === "pickup" ? AGREEMENT_SECTIONS_PICKUP : AGREEMENT_SECTIONS;
  const wrap = $("#agreement");
  wrap.innerHTML = sections
    .map((s) => {
      let body = "";
      if (s.paragraphs) body += s.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
      if (s.bullets)    body += "<ul>" + s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("") + "</ul>";
      return `<h3>${escapeHtml(s.title)}</h3>${body}`;
    })
    .join("");
}

function adaptFormForAgreementType() {
  if (order.agreementType === "pickup") {
    // Rename "Setup time" to "Pickup time"
    const setupLabel = document.querySelector('label[for="ev-setup"]');
    if (setupLabel) setupLabel.textContent = "Pickup time *";
    // Hide hopper (not applicable for bounce house self-pickup)
    const hopperRow = $("#ev-hopper").closest(".row");
    if (hopperRow) hopperRow.style.display = "none";
    // Hide event start & end columns only (ev-setup stays visible as pickup time)
    const startCol = $("#ev-start").parentElement;
    const endCol = $("#ev-end").parentElement;
    if (startCol) startCol.style.display = "none";
    if (endCol) endCol.style.display = "none";
  }
}

function setupSignaturePad() {
  const canvas = $("#sig-canvas");
  function resize() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    if (signaturePad) signaturePad.clear();
  }
  window.addEventListener("resize", resize);
  resize();
  signaturePad = new window.SignaturePad(canvas, {
    backgroundColor: "rgba(255,255,255,0)",
    penColor: "rgb(25, 25, 30)",
  });
  signaturePad.addEventListener("endStroke", updateSubmitButton);
  $("#clear-sig").addEventListener("click", () => {
    signaturePad.clear();
    updateSubmitButton();
  });
  $("#sig-date").textContent = new Date().toLocaleString("en-CA", { timeZone: "America/Winnipeg" });
}

function updateSubmitButton() {
  const nameOk = $("#ci-name").value.trim().length > 0;
  const emailOk = $("#ci-email").value.trim().length > 0;
  const dateOk = $("#ev-date").value.trim().length > 0;
  const addressOk = $("#ev-address").value.trim().length > 0;
  const setupOk = $("#ev-setup").value.trim().length > 0;
  const isPickup = order && order.agreementType === "pickup";
  const startOk = isPickup || $("#ev-start").value.trim().length > 0;
  const endOk = isPickup || $("#ev-end").value.trim().length > 0;
  const hopperOk = isPickup || $("#ev-hopper").value.trim().length > 0;
  const ok = nameOk && emailOk && dateOk && addressOk && setupOk && startOk && endOk && hopperOk
    && $("#agree-check").checked && signaturePad && !signaturePad.isEmpty();
  $("#submit-btn").disabled = !ok;
}

async function loadOrder() {
  const id = getOrderId();
  if (!id) { show("not-found"); return; }
  try {
    const r = await fetch(`${CONFIG.WORKER_URL}/api/orders/${encodeURIComponent(id)}`);
    if (r.status === 404) { show("not-found"); return; }
    if (!r.ok) throw new Error("Server error");
    order = await r.json();
    console.log("[sign.js v4] agreementType:", order.agreementType, "| customItems:", JSON.stringify(order.customItems));
    if (order.status === "signed") { show("already-signed"); return; }
    adaptFormForAgreementType();
    renderItems();
    renderAgreement();
    show("view");
    setupSignaturePad();
  } catch (e) {
    show("not-found");
  }
}

async function submit() {
  if (!signaturePad || signaturePad.isEmpty()) return;
  const errBox = $("#sign-error");
  errBox.classList.add("hidden");

  const clientInfo = {
    name: $("#ci-name").value.trim(),
    email: $("#ci-email").value.trim(),
    phone: $("#ci-phone").value.trim(),
    notes: $("#ci-notes").value.trim(),
  };

  const eventInfo = {
    date: $("#ev-date").value,
    setupTime: $("#ev-setup").value,
    start: $("#ev-start").value,
    end: $("#ev-end").value,
    address: $("#ev-address").value.trim(),
    hopper: $("#ev-hopper").value,
    inCity: order.inCity !== undefined ? order.inCity : true,
  };

  if (!clientInfo.name || !clientInfo.email) {
    errBox.textContent = "Please fill in your full name and email address.";
    errBox.classList.remove("hidden");
    return;
  }

  const isPickup = order && order.agreementType === "pickup";
  const timeFieldsOk = isPickup || (eventInfo.start && eventInfo.end);
  if (!eventInfo.date || !eventInfo.address || !eventInfo.setupTime || !timeFieldsOk) {
    errBox.textContent = "Please fill in all required event details.";
    errBox.classList.remove("hidden");
    return;
  }

  try {
    const signatureDataUrl = signaturePad.toDataURL("image/png");
    const signedAt = new Date().toISOString();
    const orderForPdf = { ...order, client: clientInfo, event: eventInfo, signedAt };
    const { dataUrl, filename } = await buildAgreementPDF(orderForPdf, signatureDataUrl);

    show("submitting");

    const base64 = dataUrl.split(",")[1];

    const r = await fetch(`${CONFIG.WORKER_URL}/api/orders/${encodeURIComponent(order.id)}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signedAt,
        signatureDataUrl,
        pdfBase64: base64,
        pdfFilename: filename,
        clientInfo,
        eventInfo,
      }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Submission failed");
    window.location.href = "success.html";
  } catch (e) {
    show("view");
    errBox.textContent = "We couldn't submit your signed agreement: " + e.message + " — please try again.";
    errBox.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  $("#agree-check").addEventListener("change", updateSubmitButton);

  ["ci-name", "ci-email", "ci-phone", "ev-date", "ev-address"].forEach((id) =>
    $("#" + id).addEventListener("input", updateSubmitButton)
  );
  ["ev-setup", "ev-start", "ev-end", "ev-hopper"].forEach((id) =>
    $("#" + id).addEventListener("change", updateSubmitButton)
  );
  $("#ev-date").addEventListener("change", updateSubmitButton);
  $("#submit-btn").addEventListener("click", submit);

  const waitForLibs = () => new Promise((resolve) => {
    const ok = () => window.jspdf && window.SignaturePad;
    if (ok()) return resolve();
    const t = setInterval(() => { if (ok()) { clearInterval(t); resolve(); } }, 50);
  });
  await waitForLibs();
  await loadOrder();
});
