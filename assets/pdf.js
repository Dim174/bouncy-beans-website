// PDF generation using jsPDF (loaded via CDN in sign.html as window.jspdf).
// Produces a branded, multi-page Rental Agreement PDF with order details
// and the embedded signature image.

import { CONFIG } from "./config.js";
import { AGREEMENT_TITLE, AGREEMENT_SECTIONS } from "./agreement.js";
import { getItemById } from "./items.js";

const BRAND = [224, 71, 126];      // #e0477e
const TEXT  = [42, 42, 53];
const MUTED = [107, 107, 120];
const LINE  = [230, 220, 225];

const PAGE_W = 210;   // A4 mm
const PAGE_H = 297;
const MARGIN_L = 18;
const MARGIN_R = 18;
const MARGIN_T = 20;
const MARGIN_B = 20;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

function money(n) { return "$" + Number(n || 0).toFixed(2); }

function ensureSpace(doc, cursor, needed) {
  if (cursor.y + needed > PAGE_H - MARGIN_B) {
    doc.addPage();
    drawFooter(doc);
    cursor.y = MARGIN_T;
    return true;
  }
  return false;
}

function drawFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const current = doc.internal.getCurrentPageInfo().pageNumber;
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${CONFIG.BUSINESS.name} · ${CONFIG.BUSINESS.website}`, MARGIN_L, PAGE_H - 8);
  doc.text(`Page ${current}`, PAGE_W - MARGIN_R, PAGE_H - 8, { align: "right" });
}

function drawHeader(doc, cursor, order) {
  // Brand bar
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, 12, "F");
  // Title
  doc.setFontSize(18);
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.text(CONFIG.BUSINESS.name, MARGIN_L, MARGIN_T + 2);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  const right = [
    CONFIG.BUSINESS.email,
    CONFIG.BUSINESS.phone,
    CONFIG.BUSINESS.website,
  ].filter(Boolean).join("  ·  ");
  doc.text(right, PAGE_W - MARGIN_R, MARGIN_T + 2, { align: "right" });

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_L, MARGIN_T + 6, PAGE_W - MARGIN_R, MARGIN_T + 6);

  cursor.y = MARGIN_T + 12;

  // Order number / date
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.text(AGREEMENT_TITLE, MARGIN_L, cursor.y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(`Order #${order.id || "—"}`, PAGE_W - MARGIN_R, cursor.y, { align: "right" });
  cursor.y += 8;
}

function drawKeyVals(doc, cursor, rows) {
  doc.setFontSize(10);
  const colW = CONTENT_W / 2;
  const labelColor = MUTED;
  const valueColor = TEXT;
  let colIdx = 0;
  let rowY = cursor.y;
  const rowH = 12;

  for (const [label, value] of rows) {
    const x = MARGIN_L + colIdx * colW;
    doc.setTextColor(...labelColor);
    doc.setFont("helvetica", "normal");
    doc.text(label, x, rowY);
    doc.setTextColor(...valueColor);
    doc.setFont("helvetica", "bold");
    const wrapped = doc.splitTextToSize(value || "—", colW - 4);
    doc.text(wrapped, x, rowY + 4.5);
    colIdx = 1 - colIdx;
    if (colIdx === 0) {
      rowY += rowH;
      ensureSpace(doc, { y: rowY }, rowH);
    }
  }
  if (colIdx === 1) rowY += rowH;
  cursor.y = rowY + 2;
  doc.setFont("helvetica", "normal");
}

function drawSectionTitle(doc, cursor, text) {
  ensureSpace(doc, cursor, 10);
  doc.setFontSize(12);
  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.text(text, MARGIN_L, cursor.y);
  cursor.y += 2;
  doc.setDrawColor(...LINE);
  doc.line(MARGIN_L, cursor.y, PAGE_W - MARGIN_R, cursor.y);
  cursor.y += 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT);
  doc.setFontSize(10);
}

function drawItemsTable(doc, cursor, order) {
  drawSectionTitle(doc, cursor, "Items & pricing");

  // table header
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("Item", MARGIN_L, cursor.y);
  doc.text("Price (CAD)", PAGE_W - MARGIN_R, cursor.y, { align: "right" });
  cursor.y += 2;
  doc.setDrawColor(...LINE);
  doc.line(MARGIN_L, cursor.y, PAGE_W - MARGIN_R, cursor.y);
  cursor.y += 5;
  doc.setTextColor(...TEXT);

  let subtotal = 0;

  // Catalog items (with price overrides)
  for (const itemId of (order.items || [])) {
    const it = getItemById(itemId);
    if (!it) continue;
    const price = (order.priceOverrides && order.priceOverrides[itemId] !== undefined)
      ? Number(order.priceOverrides[itemId])
      : Number(it.price || 0);
    ensureSpace(doc, cursor, 7);
    doc.setFont("helvetica", "bold");
    doc.text(it.name, MARGIN_L, cursor.y);
    doc.setFont("helvetica", "normal");
    doc.text(money(price), PAGE_W - MARGIN_R, cursor.y, { align: "right" });
    if (it.ageRange) {
      doc.setTextColor(...MUTED);
      doc.setFontSize(9);
      doc.text(it.ageRange, MARGIN_L, cursor.y + 4);
      doc.setFontSize(10);
      doc.setTextColor(...TEXT);
      cursor.y += 9;
    } else {
      cursor.y += 6;
    }
    subtotal += price;
  }

  // Custom items
  for (const ci of (order.customItems || [])) {
    const price = Number(ci.price || 0);
    ensureSpace(doc, cursor, 7);
    doc.setFont("helvetica", "bold");
    doc.text(String(ci.name), MARGIN_L, cursor.y);
    doc.setFont("helvetica", "normal");
    doc.text(money(price), PAGE_W - MARGIN_R, cursor.y, { align: "right" });
    cursor.y += 6;
    subtotal += price;
  }

  // Totals
  const delivery = Number(order.deliveryFee || 0);
  const deposit  = Number(order.deposit || CONFIG.BUSINESS.depositAmount);
  const total = subtotal + delivery + deposit;

  cursor.y += 2;
  doc.setDrawColor(...LINE);
  doc.line(MARGIN_L, cursor.y, PAGE_W - MARGIN_R, cursor.y);
  cursor.y += 5;

  const rowT = (label, value, bold) => {
    ensureSpace(doc, cursor, 6);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, MARGIN_L, cursor.y);
    doc.text(money(value), PAGE_W - MARGIN_R, cursor.y, { align: "right" });
    cursor.y += 6;
  };
  rowT("Subtotal", subtotal);
  rowT("Delivery fee", delivery);
  rowT("Deposit (refundable 24–48h after event)", deposit);
  rowT("Total due", total, true);
  doc.setFont("helvetica", "normal");
  cursor.y += 2;
}

function drawAgreement(doc, cursor) {
  drawSectionTitle(doc, cursor, "Rental Agreement — Terms & Conditions");
  doc.setFontSize(10);
  for (const section of AGREEMENT_SECTIONS) {
    ensureSpace(doc, cursor, 10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT);
    const tWrap = doc.splitTextToSize(section.title, CONTENT_W);
    doc.text(tWrap, MARGIN_L, cursor.y);
    cursor.y += tWrap.length * 5 + 1;
    doc.setFont("helvetica", "normal");

    if (section.paragraphs) {
      for (const p of section.paragraphs) {
        const lines = doc.splitTextToSize(p, CONTENT_W);
        ensureSpace(doc, cursor, lines.length * 5 + 2);
        doc.text(lines, MARGIN_L, cursor.y);
        cursor.y += lines.length * 5 + 2;
      }
    }
    if (section.bullets) {
      for (const b of section.bullets) {
        const lines = doc.splitTextToSize("•  " + b, CONTENT_W - 2);
        ensureSpace(doc, cursor, lines.length * 5 + 1);
        doc.text(lines, MARGIN_L + 2, cursor.y);
        cursor.y += lines.length * 5 + 1;
      }
    }
    cursor.y += 2;
  }
}

function drawSignature(doc, cursor, order, signatureDataUrl) {
  ensureSpace(doc, cursor, 70);
  drawSectionTitle(doc, cursor, "Signature");

  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("Client signature:", MARGIN_L, cursor.y);
  cursor.y += 4;
  // Signature box
  const sigX = MARGIN_L;
  const sigY = cursor.y;
  const sigW = 80;
  const sigH = 30;
  doc.setDrawColor(...LINE);
  doc.rect(sigX, sigY, sigW, sigH);
  if (signatureDataUrl) {
    try {
      doc.addImage(signatureDataUrl, "PNG", sigX + 1, sigY + 1, sigW - 2, sigH - 2);
    } catch (e) {
      // ignore image errors
    }
  }
  // Printed name + date right column
  const textX = MARGIN_L + sigW + 10;
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text("Printed name", textX, sigY + 6);
  doc.setTextColor(...TEXT);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(order.client?.name || "—", textX, sigY + 11);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text("Signed on", textX, sigY + 19);
  doc.setTextColor(...TEXT);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  const signedAt = order.signedAt ? new Date(order.signedAt) : new Date();
  doc.text(signedAt.toLocaleString("en-CA", { timeZone: "America/Winnipeg" }), textX, sigY + 24);

  cursor.y = sigY + sigH + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(
    "By signing, the Renter confirms they have read, understood, and agree to the Rental Agreement terms above.",
    MARGIN_L, cursor.y, { maxWidth: CONTENT_W }
  );
}

/**
 * Build the signed rental agreement PDF.
 * Returns { blob, dataUrl, filename }.
 */
export async function buildAgreementPDF(order, signatureDataUrl) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const cursor = { y: MARGIN_T };
  drawHeader(doc, cursor, order);

  // Client info block
  drawSectionTitle(doc, cursor, "Client & Event");
  drawKeyVals(doc, cursor, [
    ["Client name", order.client?.name],
    ["Client email", order.client?.email],
    ["Client phone", order.client?.phone || "—"],
    ["Event date", order.event?.date],
    ["Setup time", order.event?.setupTime],
    ["Event start", order.event?.start],
    ["Event end", order.event?.end || "—"],
    ["Hopper style", order.event?.hopper || "—"],
    ["Event address", order.event?.address],
  ]);

  drawItemsTable(doc, cursor, order);
  drawAgreement(doc, cursor);
  drawSignature(doc, cursor, order, signatureDataUrl);

  // Footer on every page
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc);
  }

  const blob = doc.output("blob");
  const dataUrl = doc.output("datauristring"); // "data:application/pdf;base64,..."
  const safeName = (order.client?.name || "client").replace(/[^a-z0-9_-]+/gi, "_");
  const filename = `BouncyBeans_${safeName}_${order.id || "order"}.pdf`;

  return { blob, dataUrl, filename };
}
