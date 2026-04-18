import { CONFIG } from "./config.js";
import { AGREEMENT_SECTIONS } from "./agreement.js";
import { getItemById } from "./items.js";
import { buildAgreementPDF } from "./pdf.js";

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

function renderClient() {
  const c = $("#client-block");
  const rows = [
    ["Client name", order.client?.name],
    ["Email", order.client?.email],
    ["Phone", order.client?.phone || "—"],
    ["Event date", order.event?.date],
    ["Setup time", order.event?.setupTime],
    ["Event start", order.event?.start],
    ["Rental duration", `${order.event?.rentalHours} hour${order.event?.rentalHours === 1 ? "" : "s"}`],
    ["Event address", order.event?.address],
  ];
  c.innerHTML = rows
    .map(([l, v]) => `<div><label>${escapeHtml(l)}</label><div>${escapeHtml(v || "—")}</div></div>`)
    .join("");
}

function renderItems() {
  const tbody = $("#items-body");
  let subtotal = 0;
  const rows = [];
  for (const id of order.items) {
    const it = getItemById(id);
    if (!it) continue;
    subtotal += Number(it.price || 0);
    rows.push(
      `<tr><td><strong>${escapeHtml(it.name)}</strong>${it.ageRange ? `<br><span class="muted small">${escapeHtml(it.ageRange)}</span>` : ""}</td><td class="right">${money(it.price)}</td></tr>`
    );
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
  const wrap = $("#agreement");
  wrap.innerHTML = AGREEMENT_SECTIONS
    .map((s) => {
      let body = "";
      if (s.paragraphs) body += s.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
      if (s.bullets)    body += "<ul>" + s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("") + "</ul>";
      return `<h3>${escapeHtml(s.title)}</h3>${body}`;
    })
    .join("");
}

function setupSignaturePad() {
  const canvas = $("#sig-canvas");
  // HiDPI scaling
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
  const ok = $("#agree-check").checked && signaturePad && !signaturePad.isEmpty();
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
    if (order.status === "signed") { show("already-signed"); return; }

    renderClient();
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
  try {
    const signatureDataUrl = signaturePad.toDataURL("image/png");
    const signedAt = new Date().toISOString();
    const orderForPdf = { ...order, signedAt };
    const { dataUrl, filename } = await buildAgreementPDF(orderForPdf, signatureDataUrl);

    show("submitting");

    // dataUrl: "data:application/pdf;base64,XXXX"
    const base64 = dataUrl.split(",")[1];

    const r = await fetch(`${CONFIG.WORKER_URL}/api/orders/${encodeURIComponent(order.id)}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signedAt,
        signatureDataUrl,   // for audit trail
        pdfBase64: base64,
        pdfFilename: filename,
      }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Submission failed");
    // success
    window.location.href = "success.html";
  } catch (e) {
    show("view");
    errBox.textContent = "We couldn't submit your signed agreement: " + e.message + " — please try again.";
    errBox.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  $("#agree-check").addEventListener("change", updateSubmitButton);
  $("#submit-btn").addEventListener("click", submit);
  // Wait a frame for deferred scripts
  const waitForLibs = () => new Promise((resolve) => {
    const ok = () => window.jspdf && window.SignaturePad;
    if (ok()) return resolve();
    const t = setInterval(() => { if (ok()) { clearInterval(t); resolve(); } }, 50);
  });
  await waitForLibs();
  await loadOrder();
});
