/* =====================================================================
   Stanza Client Portal
   A static page talking straight to Supabase. There is no server of our
   own: the database decides what each person may read and write, so the
   worst a tampered copy of this file can do is ask questions it will not
   get answers to.
   ===================================================================== */
(function () {
  "use strict";

  const CFG = window.STANZA_CONFIG;
  const SB = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const BUCKET = "project-files";
  const MAX_UPLOAD = 50 * 1024 * 1024; // 50 MB per file

  /* ---------------------------------------------------------------- */
  /* Small helpers                                                     */
  /* ---------------------------------------------------------------- */

  function esc(v) {
    if (v === null || v === undefined) return "";
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtDate(d) {
    if (!d) return "—";
    const t = new Date(d + (String(d).length === 10 ? "T00:00:00" : ""));
    if (isNaN(t)) return esc(d);
    return `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`;
  }
  function fmtNum(n) {
    if (n === null || n === undefined || n === "") return "—";
    const x = Number(n); return isNaN(x) ? esc(n) : x.toLocaleString("en-US");
  }
  function fmtMMK(n) {
    if (n === null || n === undefined || n === "") return "—";
    const x = Number(n); return isNaN(x) ? esc(n) : x.toLocaleString("en-US") + " MMK";
  }
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1048576) return Math.round(n / 1024) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function safeFileName(n) {
    let s = String(n || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
    return s || "file";
  }

  const ICONS = {
    overview: '<path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z"/>',
    project: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
    timeline: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    team: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15 20a5 5 0 0 1 8.5-3.6"/>',
    materials: '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    boq: '<path d="M6 3h9l3 3v15H6Z"/><path d="M15 3v3h3"/><path d="M9 11h6M9 15h6M9 19h3"/>',
    designs: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6"/><circle cx="8" cy="9" r="1.4"/>',
    gallery: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    approvals: '<path d="M9 12.5 11.2 15 16 9"/><circle cx="12" cy="12" r="9"/>',
    issues: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    variations: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
    documents: '<path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5"/><path d="M9.5 13h5M9.5 17h5"/>',
    finance: '<circle cx="12" cy="12" r="9"/><path d="M9 15s.75 1.5 3 1.5 3-1 3-2.2c0-2.8-6-1.3-6-4.1C9 8.9 10.5 8 12 8s3 .9 3 .9M12 6.5v1M12 16.5v1"/>',
    meetings: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    users: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 6.5l3 3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    warn: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
    pdf: '<path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5"/><path d="M9.5 12h1.2a1.4 1.4 0 0 1 0 2.8H9.5V12Zm0 2.8V18"/><path d="M14 12v6h.8a1.6 1.6 0 0 0 1.6-1.6v-2.8A1.6 1.6 0 0 0 14.8 12H14Z"/>',
    download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M4.5 19.5h15"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  };
  function icon(n, s) {
    s = s || 16;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor"
      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ""}</svg>`;
  }

  function pillTone(v) {
    const s = String(v || "").toLowerCase();
    if (/approved|completed|paid|resolved|closed|final|active|on track|signed|acknowledged/.test(s)) return "ok";
    if (/pending|submitted|upcoming|in progress|draft|requested|issued|not started/.test(s)) return "info";
    if (/revision|attention|on hold|due|partially/.test(s)) return "warn";
    if (/rejected|overdue|delayed|over budget|critical|open|superseded/.test(s)) return "danger";
    return "hold";
  }
  function pill(v) {
    if (!v) return "—";
    return `<span class="pill pill-${pillTone(v)}"><span class="pill-dot"></span>${esc(v)}</span>`;
  }
  function emptyState(t) { return `<div class="empty-state">${esc(t)}</div>`; }

  /* ---------------------------------------------------------------- */
  /* Application state                                                 */
  /* ---------------------------------------------------------------- */

  const UI = {
    booted: false,
    screen: "loading",       // loading | login | forgot | reset | app
    page: "overview",
    projectId: null,
    search: "",
    filter: "All",
    sidebarOpen: false,
    modal: null,
    pdfView: null,
    banner: null,
    busy: false,
    authError: null,
    authNote: null,
  };

  let ME = null;             // profile row of the signed-in person
  let PROJECTS = [];         // projects this person may open
  let SETTINGS = {};         // portal_settings row
  let D = {};                // the current project's records, by table name
  const SIGNED = new Map();  // storage_path -> { url, expires }

  function isStaff() { return !!ME && ME.kind === "staff"; }
  function hasRole(list) { return isStaff() && list.indexOf(ME.role) !== -1; }
  function canEdit() { return isStaff(); }
  function project() { return PROJECTS.find((p) => p.id === UI.projectId) || PROJECTS[0] || null; }

  /* ---------------------------------------------------------------- */
  /* What each page is                                                 */
  /* ---------------------------------------------------------------- */

  const SELECT = {
    milestoneStatus: ["Not Started", "In Progress", "Pending Client Approval", "On Hold", "Completed"],
    materialStatus: ["Pending", "Submitted", "Approved", "Revision Requested", "Rejected"],
    approvalState: ["Pending", "Approved", "Revision Requested", "Rejected"],
    priority: ["Low", "Medium", "High", "Critical"],
    issueStatus: ["Open", "In Progress", "Resolved", "Closed"],
    voStatus: ["Requested", "Approved", "In Progress", "Completed", "Rejected"],
    docStatus: ["Draft", "Final", "Approved", "Signed", "Superseded", "Issued"],
    payStatus: ["Upcoming", "Due", "Paid", "Overdue", "Partially Paid"],
    invoiceKind: ["invoice", "receipt"],
    quoteStatus: ["Draft", "Issued", "Accepted", "Superseded", "Expired"],
    designStatus: ["Draft", "Pending Approval", "Revision Requested", "Approved", "Final Approved"],
    designCategory: ["Mood Board", "Floor Plan", "3D Render", "Elevation", "Detail Drawing", "Other"],
    scheduleStatus: ["On Track", "Attention Required", "Delayed", "Completed"],
    budgetStatus: ["On Track", "Attention Required", "Over Budget"],
    visibility: ["client", "internal"],
    meetingStatus: ["Pending", "Acknowledged"],
  };

  // Every record type that carries a file gets these three, appended last.
  const FILE_FIELDS = [
    { key: "__file", label: "Attached file", type: "file", full: true },
    { key: "external_url", label: "Or a link (Google Drive, Dropbox)", type: "url", full: true },
    { key: "visibility", label: "Who can see this", type: "select", options: SELECT.visibility, staffOnly: true },
  ];
  const VIS_ONLY = [{ key: "visibility", label: "Who can see this", type: "select", options: SELECT.visibility, staffOnly: true }];

  const SCHEMA = {
    milestones: {
      label: "Timeline", icon: "timeline", group: "work", table: "milestones",
      style: "table", title: "name", order: "sequence",
      columns: ["sequence", "name", "status", "progress_pct", "planned_end"],
      fields: [
        { key: "name", label: "Stage name", full: true },
        { key: "sequence", label: "Order", type: "number" },
        { key: "status", label: "Status", type: "select", options: SELECT.milestoneStatus },
        { key: "progress_pct", label: "Progress (%)", type: "number" },
        { key: "planned_start", label: "Planned start", type: "date" },
        { key: "planned_end", label: "Planned finish", type: "date" },
        { key: "actual_start", label: "Actual start", type: "date" },
        { key: "actual_end", label: "Actual finish", type: "date" },
      ].concat(VIS_ONLY),
    },
    design_revisions: {
      label: "Design Files", icon: "designs", group: "work", table: "design_revisions",
      style: "gallery", title: "file_name", sub: "category", order: "uploaded_at", desc: true,
      preview: "preview_file_id",
      fields: [
        { key: "file_name", label: "Drawing name", full: true },
        { key: "category", label: "Category", type: "select", options: SELECT.designCategory },
        { key: "revision", label: "Revision" },
        { key: "status", label: "Status", type: "select", options: SELECT.designStatus },
        { key: "description", label: "Description", full: true, type: "textarea" },
        { key: "uploaded_at", label: "Upload date", type: "date" },
        { key: "__preview", label: "Preview image", type: "image", full: true },
      ].concat(FILE_FIELDS),
    },
    site_media: {
      label: "Site Photos", icon: "gallery", group: "work", table: "site_media",
      style: "gallery", title: "caption", sub: "area", order: "captured_on", desc: true,
      preview: "file_id",
      fields: [
        { key: "__preview", label: "Photo", type: "image", full: true, fileKey: "file_id" },
        { key: "caption", label: "Caption", full: true, type: "textarea" },
        { key: "captured_on", label: "Date taken", type: "date" },
        { key: "category", label: "Category" },
        { key: "phase", label: "Phase" },
        { key: "area", label: "Area" },
      ].concat(VIS_ONLY),
    },
    materials: {
      label: "Materials", icon: "materials", group: "work", table: "materials",
      style: "table", title: "name", sub: "category", order: "name",
      columns: ["name", "category", "supplier", "quantity", "status"],
      fields: [
        { key: "name", label: "Material name", full: true },
        { key: "category", label: "Category" },
        { key: "brand", label: "Brand" },
        { key: "supplier", label: "Supplier" },
        { key: "spec", label: "Specification", full: true, type: "textarea" },
        { key: "colour", label: "Colour" },
        { key: "size", label: "Size" },
        { key: "unit", label: "Unit" },
        { key: "quantity", label: "Quantity", type: "number" },
        { key: "application", label: "Where it is used", full: true },
        { key: "lead_time", label: "Lead time" },
        { key: "status", label: "Status", type: "select", options: SELECT.materialStatus },
        { key: "client_comment", label: "Client comment", full: true, type: "textarea" },
        { key: "__sample", label: "Sample photo", type: "image", full: true, fileKey: "sample_file_id" },
      ].concat(VIS_ONLY),
    },
    documents: {
      label: "Documents", icon: "documents", group: "clientflow", table: "documents",
      style: "table", title: "name", sub: "folder", order: "uploaded_at", desc: true,
      columns: ["name", "folder", "version", "status", "uploaded_at"],
      fields: [
        { key: "name", label: "Document name", full: true },
        { key: "folder", label: "Folder" },
        { key: "version", label: "Version" },
        { key: "status", label: "Status", type: "select", options: SELECT.docStatus },
        { key: "uploaded_at", label: "Date", type: "date" },
      ].concat(FILE_FIELDS),
    },
    approvals: {
      label: "Approvals", icon: "approvals", group: "clientflow", table: "approvals",
      style: "table", title: "title", sub: "category", order: "submitted_at", desc: true,
      columns: ["title", "category", "submitted_at", "deadline", "response"],
      fields: [
        { key: "title", label: "What needs approving", full: true },
        { key: "category", label: "Category" },
        { key: "deadline", label: "Please respond by", type: "date" },
        { key: "response", label: "Your decision", type: "select", options: SELECT.approvalState, clientEditable: true },
        { key: "comment", label: "Your comment", full: true, type: "textarea", clientEditable: true },
      ],
    },
    site_issues: {
      label: "Site Issues", icon: "issues", group: "clientflow", table: "site_issues",
      style: "table", title: "title", sub: "area", order: "reported_at", desc: true,
      columns: ["title", "area", "priority", "status", "target_date"],
      fields: [
        { key: "title", label: "Issue", full: true },
        { key: "description", label: "Description", full: true, type: "textarea" },
        { key: "area", label: "Area" },
        { key: "priority", label: "Priority", type: "select", options: SELECT.priority },
        { key: "reported_at", label: "Reported on", type: "date" },
        { key: "reported_by", label: "Reported by" },
        { key: "responsible", label: "Responsible" },
        { key: "target_date", label: "Target fix date", type: "date" },
        { key: "status", label: "Status", type: "select", options: SELECT.issueStatus },
        { key: "corrective_action", label: "Corrective action", full: true, type: "textarea" },
      ].concat(VIS_ONLY),
    },
    variation_orders: {
      label: "Variation Orders", icon: "variations", group: "clientflow", table: "variation_orders",
      style: "table", title: "vo_no", sub: "area", order: "request_date", desc: true,
      columns: ["vo_no", "description", "cost_impact", "client_approval", "status"],
      fields: [
        { key: "vo_no", label: "VO number" },
        { key: "request_date", label: "Requested on", type: "date" },
        { key: "requested_by", label: "Requested by" },
        { key: "description", label: "What changes", full: true, type: "textarea" },
        { key: "reason", label: "Why", full: true, type: "textarea" },
        { key: "area", label: "Area" },
        { key: "cost_impact", label: "Cost impact (MMK)", type: "number" },
        { key: "time_impact", label: "Time impact" },
        { key: "client_approval", label: "Client approval", type: "select", options: SELECT.approvalState },
        { key: "status", label: "Status", type: "select", options: SELECT.voStatus },
      ].concat(FILE_FIELDS),
    },
    quotations: {
      label: "Quotations", icon: "boq", group: "clientflow", table: "quotations",
      style: "table", title: "quote_no", order: "issued_at", desc: true,
      columns: ["quote_no", "version", "issued_at", "amount", "status"],
      fields: [
        { key: "quote_no", label: "Quotation number" },
        { key: "version", label: "Version" },
        { key: "issued_at", label: "Issued on", type: "date" },
        { key: "valid_until", label: "Valid until", type: "date" },
        { key: "amount", label: "Amount (MMK)", type: "number" },
        { key: "status", label: "Status", type: "select", options: SELECT.quoteStatus },
      ].concat(FILE_FIELDS),
    },
    meetings: {
      label: "Meetings", icon: "meetings", group: "clientflow", table: "meetings",
      style: "table", title: "title", sub: "type", order: "meeting_date", desc: true,
      columns: ["title", "meeting_date", "location", "type"],
      fields: [
        { key: "title", label: "Title", full: true },
        { key: "type", label: "Type" },
        { key: "meeting_date", label: "Date", type: "date" },
        { key: "meeting_time", label: "Time", type: "time" },
        { key: "location", label: "Location", full: true },
        { key: "attendees", label: "Attendees", full: true },
        { key: "agenda", label: "Agenda", full: true, type: "textarea" },
        { key: "summary", label: "Summary", full: true, type: "textarea" },
        { key: "decisions", label: "Decisions", full: true, type: "textarea" },
      ].concat(FILE_FIELDS),
    },
    payment_schedule: {
      label: "Payment Schedule", icon: "finance", group: "finance", table: "payment_schedule",
      style: "table", title: "milestone", order: "due_date",
      columns: ["milestone", "due_date", "amount", "status"],
      fields: [
        { key: "milestone", label: "Milestone", full: true },
        { key: "due_date", label: "Due date", type: "date" },
        { key: "amount", label: "Amount (MMK)", type: "number" },
        { key: "status", label: "Status", type: "select", options: SELECT.payStatus },
      ].concat(VIS_ONLY),
    },
    invoices: {
      label: "Invoices & Receipts", icon: "finance", group: "finance", table: "invoices",
      style: "table", title: "invoice_no", order: "issue_date", desc: true,
      columns: ["invoice_no", "kind", "related_to", "amount", "status"],
      fields: [
        { key: "invoice_no", label: "Number" },
        { key: "kind", label: "Type", type: "select", options: SELECT.invoiceKind },
        { key: "related_to", label: "Related to", full: true },
        { key: "issue_date", label: "Issued on", type: "date" },
        { key: "due_date", label: "Due on", type: "date" },
        { key: "amount", label: "Amount (MMK)", type: "number" },
        { key: "status", label: "Status", type: "select", options: SELECT.payStatus },
      ].concat(FILE_FIELDS),
    },
  };

  const PROJECT_FIELDS = [
    { key: "name", label: "Project name", full: true },
    { key: "code", label: "Project code" },
    { key: "type", label: "Project type" },
    { key: "category", label: "Category" },
    { key: "address", label: "Site address", full: true, type: "textarea" },
    { key: "area_sqft", label: "Area (sq ft)", type: "number" },
    { key: "floors", label: "Floors", type: "number" },
    { key: "design_style", label: "Design style", full: true },
    { key: "description", label: "Description", full: true, type: "textarea" },
    { key: "scope", label: "Scope of work", full: true, type: "textarea" },
    { key: "contract_date", label: "Contract date", type: "date" },
    { key: "commencement_date", label: "Start date", type: "date" },
    { key: "target_completion_date", label: "Target finish", type: "date" },
    { key: "warranty_period", label: "Warranty period", full: true },
    { key: "emergency_contact", label: "Site contact" },
    { key: "working_hours", label: "Working hours" },
    { key: "site_rules", label: "Site rules", full: true, type: "textarea" },
    { key: "notes", label: "Notes", full: true, type: "textarea" },
  ];

  const NAV_GROUPS = [
    { key: "work", label: "Project" },
    { key: "clientflow", label: "Client Interaction" },
    { key: "finance", label: "Payments" },
    { key: "admin", label: "Admin" },
  ];
  const NAV_ORDER = ["milestones", "design_revisions", "site_media", "materials",
                     "documents", "approvals", "site_issues", "variation_orders",
                     "quotations", "meetings", "payment_schedule", "invoices"];

  /* ---------------------------------------------------------------- */
  /* Loading data                                                      */
  /* ---------------------------------------------------------------- */

  async function loadMe() {
    const { data: { user } } = await SB.auth.getUser();
    if (!user) { ME = null; return false; }
    const { data, error } = await SB.from("profiles").select("*").eq("id", user.id).single();
    if (error) { ME = null; return false; }
    ME = data;
    if (!ME.email) ME.email = user.email;
    return true;
  }

  async function loadProjects() {
    const { data, error } = await SB.from("projects").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    PROJECTS = data || [];
    if (!UI.projectId || !PROJECTS.some((p) => p.id === UI.projectId)) {
      UI.projectId = PROJECTS.length ? PROJECTS[0].id : null;
    }
  }

  async function loadSettings() {
    const { data } = await SB.from("portal_settings").select("*").eq("id", 1).maybeSingle();
    SETTINGS = data || {};
  }

  const TABLES = ["milestones", "progress_snapshots", "design_revisions", "site_media",
                  "materials", "documents", "approvals", "site_issues", "variation_orders",
                  "quotations", "meetings", "payment_schedule", "invoices", "payments", "files"];

  async function loadProjectData() {
    D = {};
    const pid = UI.projectId;
    if (!pid) return;
    const results = await Promise.all(TABLES.map((t) =>
      SB.from(t).select("*").eq("project_id", pid).then((r) => [t, r])
    ));
    results.forEach(([t, r]) => {
      if (r.error) { console.warn("load " + t, r.error.message); D[t] = []; }
      else D[t] = r.data || [];
    });
    sortAll();
    await refreshSignedUrls();
  }

  function sortAll() {
    Object.keys(SCHEMA).forEach((k) => {
      const s = SCHEMA[k];
      if (!D[s.table]) return;
      D[s.table].sort((a, b) => {
        const x = a[s.order] ?? "", y = b[s.order] ?? "";
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return s.desc ? -c : c;
      });
    });
    (D.progress_snapshots || []).sort((a, b) => String(b.recorded_on).localeCompare(String(a.recorded_on)));
  }

  function fileById(id) { return (D.files || []).find((f) => f.id === id) || null; }

  /* Signed URLs last an hour; ask for them in one batch, not one by one. */
  async function refreshSignedUrls() {
    const paths = (D.files || []).filter((f) => !f.deleted_at).map((f) => f.storage_path);
    if (!paths.length) return;
    try {
      const { data, error } = await SB.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) return;
      (data || []).forEach((row) => {
        if (row.signedUrl) SIGNED.set(row.path, { url: row.signedUrl, at: Date.now() });
      });
    } catch (e) { /* a viewer with no permitted files simply gets nothing */ }
  }
  function urlFor(fileId) {
    const f = fileById(fileId);
    if (!f) return "";
    const s = SIGNED.get(f.storage_path);
    return s ? s.url : "";
  }

  /* ---------------------------------------------------------------- */
  /* Writing                                                           */
  /* ---------------------------------------------------------------- */

  async function saveRow(table, row, id) {
    /* An empty box means "leave this alone", not "write NULL". Sending an
       explicit null defeats the column defaults - uploaded_at is NOT NULL
       DEFAULT now(), so a blank date field was failing every insert - and
       there is no case in this app where blanking a field is meant to
       erase a value the database filled in. */
    const payload = {};
    Object.keys(row).forEach((k) => {
      if (k.startsWith("__")) return;
      const v = row[k];
      if (v === "" || v === undefined) return;
      payload[k] = v;
    });
    payload.project_id = UI.projectId;
    if (id) {
      const { error } = await SB.from(table).update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await SB.from(table).insert(payload);
      if (error) throw error;
    }
  }

  async function deleteRow(table, id) {
    const { error } = await SB.from(table).delete().eq("id", id);
    if (error) throw error;
  }

  /* Upload straight to storage, then record it in `files`. The storage
     policy checks the first path segment against project membership, so
     the path shape below is load-bearing, not cosmetic. */
  async function uploadFile(file, category, visibility) {
    if (file.size > MAX_UPLOAD) throw new Error("That file is " + fmtBytes(file.size) + ". The limit is " + fmtBytes(MAX_UPLOAD) + ".");
    const path = `${UI.projectId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: upErr } = await SB.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream", upsert: false,
    });
    if (upErr) throw upErr;
    const { data, error } = await SB.from("files").insert({
      project_id: UI.projectId, storage_path: path, original_name: file.name,
      mime_type: file.type || "application/octet-stream", size_bytes: file.size,
      category: category || "other", visibility: visibility || "internal",
      uploaded_by: ME.id,
    }).select().single();
    if (error) throw error;
    D.files = D.files || []; D.files.push(data);
    const { data: signed } = await SB.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (signed) SIGNED.set(path, { url: signed.signedUrl, at: Date.now() });
    return data;
  }

  async function downloadFile(fileId) {
    const f = fileById(fileId);
    if (!f) return;
    const { data, error } = await SB.storage.from(BUCKET).createSignedUrl(f.storage_path, 120, { download: f.original_name });
    if (error) { setBanner("error", "Couldn't prepare that download: " + error.message); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl; a.download = f.original_name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------------------------------------------------------- */
  /* Auth screens                                                      */
  /* ---------------------------------------------------------------- */

  function authShell(title, sub, body) {
    return `<div class="login-screen"><div class="login-card">
      <div class="brand-word" style="text-align:center;margin-bottom:2px;">Stanza</div>
      <div class="brand-sub" style="text-align:center;margin-bottom:18px;">Client Portal</div>
      <h1 class="login-title">${esc(title)}</h1>
      <p class="login-sub">${esc(sub)}</p>
      ${UI.authError ? `<div class="banner error">${icon("warn", 15)}<span>${esc(UI.authError)}</span></div>` : ""}
      ${UI.authNote ? `<div class="banner saved">${icon("check", 15)}<span>${esc(UI.authNote)}</span></div>` : ""}
      ${body}
    </div></div>`;
  }

  function loginScreen() {
    return authShell("Sign in", "Your project's progress, drawings, documents and payments.", `
      <div class="field"><label>Email</label><input type="email" id="f-email" autocomplete="username"/></div>
      <div class="field"><label>Password</label><input type="password" id="f-password" autocomplete="current-password"/></div>
      <button class="btn btn-primary" data-action="sign-in" style="width:100%;margin-top:12px;" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Signing in…" : "Sign in"}</button>
      <button class="btn btn-ghost" data-action="go-forgot" style="width:100%;margin-top:8px;">Forgot your password?</button>`);
  }

  function forgotScreen() {
    return authShell("Reset your password", "We'll email you a link to choose a new one.", `
      <div class="field"><label>Email</label><input type="email" id="f-email" autocomplete="username"/></div>
      <button class="btn btn-primary" data-action="send-reset" style="width:100%;margin-top:12px;" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Sending…" : "Send the link"}</button>
      <button class="btn btn-ghost" data-action="go-login" style="width:100%;margin-top:8px;">Back to sign in</button>`);
  }

  function resetScreen() {
    return authShell("Choose a new password", "At least 8 characters.", `
      <div class="field"><label>New password</label><input type="password" id="f-password" autocomplete="new-password"/></div>
      <div class="field"><label>Type it again</label><input type="password" id="f-password2" autocomplete="new-password"/></div>
      <button class="btn btn-primary" data-action="set-password" style="width:100%;margin-top:12px;" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Saving…" : "Save the password"}</button>`);
  }

  async function doSignIn() {
    const email = (document.getElementById("f-email") || {}).value || "";
    const password = (document.getElementById("f-password") || {}).value || "";
    if (!email || !password) { UI.authError = "Please enter your email and password."; return render(); }
    UI.busy = true; UI.authError = null; render();
    const { error } = await SB.auth.signInWithPassword({ email: email.trim(), password });
    UI.busy = false;
    if (error) { UI.authError = "That email and password don't match an account."; return render(); }
    await enterApp();
  }

  async function doSendReset() {
    const email = (document.getElementById("f-email") || {}).value || "";
    if (!email) { UI.authError = "Please enter your email."; return render(); }
    UI.busy = true; UI.authError = null; render();
    await SB.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    UI.busy = false;
    // Always the same answer, so this page can't be used to find out which
    // email addresses have accounts.
    UI.authNote = "If that address has an account, the link is on its way.";
    UI.screen = "login";
    render();
  }

  async function doSetPassword() {
    const a = (document.getElementById("f-password") || {}).value || "";
    const b = (document.getElementById("f-password2") || {}).value || "";
    if (a.length < 8) { UI.authError = "Please use at least 8 characters."; return render(); }
    if (a !== b) { UI.authError = "The two passwords don't match."; return render(); }
    UI.busy = true; UI.authError = null; render();
    const { error } = await SB.auth.updateUser({ password: a });
    UI.busy = false;
    if (error) { UI.authError = error.message; return render(); }
    UI.authNote = "Password saved.";
    await enterApp();
  }

  async function doSignOut() {
    await SB.auth.signOut();
    ME = null; PROJECTS = []; D = {}; SIGNED.clear();
    UI.screen = "login"; UI.page = "overview"; UI.projectId = null;
    UI.authNote = "Signed out."; UI.authError = null;
    render();
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  function setBanner(type, text) { UI.banner = { type, text }; render(); }

  function render() {
    const root = document.getElementById("app");
    if (UI.screen === "loading") { root.innerHTML = `<div class="boot-splash">Loading…</div>`; return; }
    if (UI.screen === "login")  { root.innerHTML = loginScreen(); return; }
    if (UI.screen === "forgot") { root.innerHTML = forgotScreen(); return; }
    if (UI.screen === "reset")  { root.innerHTML = resetScreen(); return; }
    root.innerHTML = appShell();
  }

  function appShell() {
    return `
      <div class="topbar-mobile">
        <button class="icon-btn" data-action="toggle-sidebar" aria-label="Menu">${icon("menu")}</button>
        <div class="topbar-title">${esc(pageLabel())}</div>
        <div style="width:34px"></div>
      </div>
      <div class="app-shell">
        ${sidebar()}
        <div class="sidebar-scrim" data-action="close-sidebar"></div>
        <main class="main">
          ${topbar()}
          <div class="main-inner">
            ${UI.banner ? `<div class="banner ${esc(UI.banner.type)}">${icon(UI.banner.type === "error" ? "warn" : "check", 15)}<span>${esc(UI.banner.text)}</span></div>` : ""}
            ${pageHtml()}
            ${footer()}
          </div>
        </main>
      </div>
      ${UI.modal ? modalHtml() : ""}
      ${UI.pdfView ? pdfViewerHtml() : ""}`;
  }

  function pageLabel() {
    if (UI.page === "overview") return "Overview";
    if (UI.page === "info") return "Contact & Legal";
    if (UI.page === "project") return "Project Info";
    if (UI.page === "access") return "Project Access";
    return SCHEMA[UI.page] ? SCHEMA[UI.page].label : "Overview";
  }

  function sidebar() {
    const groups = {};
    NAV_ORDER.forEach((k) => {
      const s = SCHEMA[k]; if (!s) return;
      (groups[s.group] = groups[s.group] || []).push(k);
    });
    let nav = `<button class="nav-item ${UI.page === "overview" ? "active" : ""}" data-action="goto" data-page="overview">
        <span style="display:flex;align-items:center;gap:9px">${icon("overview")}Overview</span></button>`;

    NAV_GROUPS.forEach((g) => {
      const keys = groups[g.key];
      if (g.key === "admin") {
        if (!isStaff()) return;
        nav += `<div class="nav-group-label">${esc(g.label)}</div>`;
        nav += navItem("access", "Project Access", "users", (D.__members || []).length);
        if (hasRole(["managing_director", "system_admin"])) nav += navItem("settings", "Portal Settings", "lock", null);
        return;
      }
      if (!keys || !keys.length) return;
      nav += `<div class="nav-group-label">${esc(g.label)}</div>`;
      if (g.key === "work") nav += navItem("project", "Project Info", "project", null);
      keys.forEach((k) => {
        const s = SCHEMA[k];
        nav += navItem(k, s.label, s.icon, (D[s.table] || []).length);
      });
    });
    nav += `<div class="nav-group-label">Portal</div>` + navItem("info", "Contact & Legal", "documents", null);

    const p = project();
    return `<aside class="sidebar ${UI.sidebarOpen ? "open" : ""}">
      <div class="brand">
        <div class="brand-lockup"><div><div class="brand-word">Stanza</div>
        <div class="brand-sub">Client Portal</div></div></div>
        <hr class="brand-rule"/>
      </div>
      ${PROJECTS.length > 1 ? `<div style="padding:12px 14px 4px;">
        <label class="helper-text" style="display:block;margin-bottom:4px;">Project</label>
        <select data-action="switch-project" style="width:100%;">
          ${PROJECTS.map((pr) => `<option value="${esc(pr.id)}" ${pr.id === UI.projectId ? "selected" : ""}>${esc(pr.name)}</option>`).join("")}
        </select></div>` : p ? `<div style="padding:8px 16px 4px;">
          <div class="helper-text">Project</div><div style="font-weight:600;font-size:13.5px;">${esc(p.name)}</div></div>` : ""}
      ${hasRole(["managing_director","project_manager","system_admin"]) ? `<div style="padding:10px 14px 0;">
        <button class="btn btn-sm" data-action="new-project" style="width:100%;">${icon("plus",13)} New project</button></div>` : ""}
      <div class="nav-list" style="margin-top:10px;">${nav}</div>
      <div style="margin-top:auto;padding:14px;border-top:1px solid var(--border);">
        <div style="font-size:12.5px;font-weight:600;">${esc(ME ? ME.full_name || ME.email : "")}</div>
        <div class="helper-text" style="margin-bottom:8px;">${esc(roleLabel())}</div>
        <button class="btn btn-sm btn-ghost" data-action="sign-out" style="width:100%;">${icon("logout", 13)} Sign out</button>
      </div>
    </aside>`;
  }

  function navItem(page, label, ic, count) {
    return `<button class="nav-item ${UI.page === page ? "active" : ""}" data-action="goto" data-page="${esc(page)}">
      <span style="display:flex;align-items:center;gap:9px">${icon(ic)}${esc(label)}</span>
      ${count !== null && count !== undefined ? `<span class="nav-count">${count}</span>` : ""}</button>`;
  }

  function roleLabel() {
    if (!ME) return "";
    if (ME.kind === "client") return "Client";
    return ({
      managing_director: "Managing Director", project_manager: "Project Manager",
      designer: "Designer", qs: "QS / Cost Control", finance: "Finance",
      sales: "Sales / Customer Service", system_admin: "System Admin",
      subcontractor: "Subcontractor",
    })[ME.role] || "Stanza Team";
  }

  function topbar() {
    const p = project();
    const initials = (ME && (ME.full_name || ME.email) || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return `<div class="app-topbar">
      <div><div class="topbar-greet-label">${esc(p ? p.code || "" : "")}</div>
      <div class="topbar-greet-name">${esc(p ? p.name : "No project yet")}</div></div>
      <div class="topbar-right"><div class="topbar-user">
        <div class="avatar-chip">${esc(initials)}</div>
        <div><div class="topbar-user-name">${esc(ME ? ME.full_name || ME.email : "")}</div>
        <div class="topbar-user-role">${esc(roleLabel())}</div></div>
      </div></div></div>`;
  }

  function footer() {
    const bits = [SETTINGS.phone, SETTINGS.email, SETTINGS.website].filter(Boolean);
    return `<div class="portal-footer">
      <div><strong>${esc(SETTINGS.company_name || CFG.companyName)}</strong>${bits.length ? " · " + bits.map(esc).join(" · ") : ""}</div>
      <div><a href="#" data-action="goto" data-page="info">Contact &amp; Legal</a> · Figures shown here are indicative; the signed contract governs.</div>
    </div>`;
  }

  function pageHtml() {
    if (!project()) {
      return hasRole(["managing_director","project_manager","system_admin"])
        ? `<div class="page-head"><div><div class="eyebrow">Stanza Team</div>
             <h1 class="page-title">No projects yet</h1>
             <p class="page-sub">Create the first one to get started.</p></div>
             <button class="btn btn-primary" data-action="new-project">${icon("plus",14)} New project</button></div>`
        : emptyState("You don't have a project yet. Your Stanza contact will add you to one.");
    }
    if (UI.page === "overview") return overviewHtml();
    if (UI.page === "info") return infoHtml();
    if (UI.page === "project") return projectPageHtml();
    if (UI.page === "access") return isStaff() ? accessHtml() : overviewHtml();
    if (UI.page === "settings") return hasRole(["managing_director", "system_admin"]) ? settingsHtml() : overviewHtml();
    const s = SCHEMA[UI.page];
    if (!s) return overviewHtml();
    return listPageHtml(UI.page);
  }

  /* ---- overview --------------------------------------------------- */

  function donut(pct, size, stroke) {
    size = size || 168; stroke = stroke || 14;
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--hero-track)" stroke-width="${stroke}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct/100)}"
        transform="rotate(-90 ${size/2} ${size/2})"/></svg>`;
  }

  function overviewHtml() {
    const p = project();
    const snap = (D.progress_snapshots || [])[0] || {};
    const pending = (D.approvals || []).filter((a) => (a.response || "Pending") === "Pending");
    const photos = (D.site_media || []).slice(0, 4);
    const docs = (D.documents || []).slice(0, 5);
    const nextMs = (D.milestones || []).find((m) => m.status !== "Completed");

    return `
      <div class="page-head"><div>
        <div class="eyebrow">${isStaff() ? "Stanza Team" : "Client Portal"}</div>
        <h1 class="page-title">${esc(p.name)}</h1>
        <p class="page-sub">${esc(p.type || "")}${p.address ? " · " + esc(p.address) : ""}</p>
      </div>${isStaff() ? `<button class="btn btn-primary" data-action="record-progress">${icon("plus",14)} Record progress</button>` : ""}</div>

      <div class="hero">
        <div class="hero-left">
          <div class="hero-donut">${donut(snap.overall_pct || 0)}
            <div class="hero-donut-label"><div class="hero-pct">${Math.round(snap.overall_pct || 0)}%</div>
            <div class="hero-pct-sub">complete</div></div></div>
        </div>
        <div class="hero-right">
          <div class="hero-kpis">
            <div class="kpi"><div class="kpi-label">Planned</div><div class="kpi-value">${Math.round(snap.planned_pct || 0)}%</div></div>
            <div class="kpi"><div class="kpi-label">Schedule</div><div class="kpi-value" style="font-size:15px;">${esc(snap.schedule_status || "—")}</div></div>
            <div class="kpi"><div class="kpi-label">Budget</div><div class="kpi-value" style="font-size:15px;">${esc(snap.budget_status || "—")}</div></div>
            <div class="kpi"><div class="kpi-label">Target finish</div><div class="kpi-value" style="font-size:15px;">${fmtDate(p.target_completion_date)}</div></div>
          </div>
          ${nextMs ? `<div class="hero-next"><div class="kpi-label">Up next</div>
            <div style="font-size:15px;font-weight:600;">${esc(nextMs.name)}</div>
            <div class="helper-text">${fmtDate(nextMs.planned_end)}</div></div>` : ""}
          ${snap.note ? `<p class="helper-text" style="margin-top:10px;">${esc(snap.note)}</p>` : ""}
        </div>
      </div>

      <div class="two-col" style="margin-top:22px;">
        <div class="card">
          <div class="flex-between" style="margin-bottom:10px;">
            <span class="section-title" style="margin:0;">Recent site photos</span>
            <button class="btn btn-sm btn-ghost" data-action="goto" data-page="site_media">See all →</button>
          </div>
          ${photos.length ? `<div class="gallery-grid">${photos.map((m) => tile("site_media", m)).join("")}</div>` : emptyState("No photos yet.")}
        </div>
        <div class="card">
          <div class="flex-between" style="margin-bottom:6px;">
            <span class="section-title" style="margin:0;">Waiting on ${isStaff() ? "the client" : "you"}</span>
            ${pending.length ? `<span class="pill pill-danger">${pending.length}</span>` : ""}
          </div>
          <div class="action-list">
            ${pending.length ? pending.slice(0, 4).map((a) => `
              <div class="action-item">
                <div class="action-thumb">${esc((a.category || "?").slice(0,2).toUpperCase())}</div>
                <div class="action-body"><div class="action-title">${esc(a.title)}</div>
                <div class="action-meta">${a.deadline ? "Due " + fmtDate(a.deadline) : "No deadline"}</div></div>
                <button class="btn btn-primary btn-sm" data-action="open-row" data-page="approvals" data-id="${esc(a.id)}">Review</button>
              </div>`).join("") : emptyState("Nothing waiting.")}
          </div>
          <div class="flex-between" style="margin:20px 0 8px;">
            <span class="section-title" style="margin:0;">Documents</span>
            <button class="btn btn-sm btn-ghost" data-action="goto" data-page="documents">See all →</button>
          </div>
          ${docs.length ? `<div class="action-list">${docs.map((d) => `
            <div class="action-item" data-action="open-row" data-page="documents" data-id="${esc(d.id)}" style="cursor:pointer;">
              <div class="action-thumb">${icon("documents", 18)}</div>
              <div class="action-body"><div class="action-title">${esc(d.name)}</div>
              <div class="action-meta">${esc(d.folder || "")} · ${fmtDate(d.uploaded_at)}</div></div>
              ${pill(d.status)}
            </div>`).join("")}</div>` : emptyState("No documents yet.")}
        </div>
      </div>`;
  }

  /* ---- generic list pages ----------------------------------------- */

  function searchText(row) {
    let out = "";
    Object.keys(row).forEach((k) => {
      const v = row[k];
      if (typeof v === "string" && !/^data:/.test(v)) out += " " + v;
      else if (typeof v === "number") out += " " + v;
    });
    return out.toLowerCase();
  }

  function listPageHtml(key) {
    const s = SCHEMA[key];
    const all = D[s.table] || [];
    let rows = all;
    const fdef = s.fields.find((f) => f.type === "select" && !f.staffOnly);
    if (fdef && UI.filter !== "All") rows = rows.filter((r) => r[fdef.key] === UI.filter);
    if (UI.search) { const q = UI.search.toLowerCase(); rows = rows.filter((r) => searchText(r).includes(q)); }

    const chips = fdef ? `<div class="chip-row">
      <button class="chip ${UI.filter === "All" ? "active" : ""}" data-action="set-filter" data-filter="All">All (${all.length})</button>
      ${fdef.options.filter((o) => all.some((r) => r[fdef.key] === o))
        .map((o) => `<button class="chip ${UI.filter === o ? "active" : ""}" data-action="set-filter" data-filter="${esc(o)}">${esc(o)} (${all.filter((r) => r[fdef.key] === o).length})</button>`).join("")}
    </div>` : "";

    let body;
    if (!rows.length) body = emptyState(all.length ? "Nothing matches that search." : "Nothing here yet." + (canEdit() ? " Use Add to create the first one." : ""));
    else if (s.style === "gallery") body = `<div class="gallery-grid">${rows.map((r) => tile(key, r)).join("")}</div>`;
    else body = tableHtml(key, rows);

    return `
      <div class="page-head"><div>
        <div class="eyebrow">${isStaff() ? "Stanza Team" : "Client Portal"}</div>
        <h1 class="page-title">${esc(s.label)}</h1>
        <p class="page-sub">${all.length} record${all.length === 1 ? "" : "s"}</p>
      </div>${canEdit() ? `<button class="btn btn-primary" data-action="new-row" data-page="${esc(key)}">${icon("plus",14)} Add</button>` : ""}</div>
      <div class="toolbar"><input class="search-input" type="text" placeholder="Search ${esc(s.label.toLowerCase())}…" value="${esc(UI.search)}"/></div>
      ${chips}<div style="height:14px"></div>${body}`;
  }

  function attachmentChip(key, row) {
    const s = SCHEMA[key];
    const fid = row.file_id;
    if (fid && fileById(fid)) {
      const f = fileById(fid);
      const isPdf = /pdf$/i.test(f.mime_type) || /\.pdf$/i.test(f.original_name);
      return `<span class="pdf-chip" data-action="${isPdf ? "view-file" : "download-file"}" data-file="${esc(fid)}" data-stop="1" title="${esc(f.original_name)}">${icon("pdf",11)} ${isPdf ? "PDF" : "FILE"}</span>`;
    }
    if (row.external_url) return `<a class="pdf-chip" href="${esc(row.external_url)}" target="_blank" rel="noopener" data-stop="1">↗ LINK</a>`;
    return "";
  }
  function internalChip(row) {
    if (!isStaff() || row.visibility !== "internal") return "";
    return `<span class="pdf-chip" style="background:var(--hold-soft);color:var(--hold);cursor:default;" title="Hidden from the client">Internal</span>`;
  }

  function cellValue(key, col, row) {
    const s = SCHEMA[key];
    const f = s.fields.find((x) => x.key === col);
    const v = row[col];
    if (f && f.type === "date") return fmtDate(v);
    if (col === "amount" || col === "cost_impact") return fmtMMK(v);
    if (f && f.type === "number") return fmtNum(v);
    if (/status|response|approval|priority/.test(col)) return pill(v);
    return esc(v === null || v === undefined || v === "" ? "—" : v);
  }

  function tableHtml(key, rows) {
    const s = SCHEMA[key];
    const admin = canEdit();
    return `<div class="table-wrap"><table><thead><tr>
      ${s.columns.map((c) => {
        const f = s.fields.find((x) => x.key === c);
        return `<th${/amount|qty|quantity|cost|progress|sequence/.test(c) ? ' class="num"' : ""}>${esc(f ? f.label : c)}</th>`;
      }).join("")}<th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-action="open-row" data-page="${esc(key)}" data-id="${esc(r.id)}" style="cursor:pointer">
        ${s.columns.map((c) => `<td${/amount|qty|quantity|cost|progress|sequence/.test(c) ? ' class="num"' : ""}>${
          c === s.title ? `<strong>${cellValue(key, c, r)}</strong>${attachmentChip(key, r)}${internalChip(r)}` : cellValue(key, c, r)
        }</td>`).join("")}
        <td><div class="row-actions">
          ${admin ? `<button class="btn btn-sm btn-ghost" data-action="open-row" data-page="${esc(key)}" data-id="${esc(r.id)}" data-stop="1" aria-label="Edit">${icon("edit",14)}</button>` : ""}
        </div></td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function tile(key, row) {
    const s = SCHEMA[key];
    const previewId = row[s.preview] || row.file_id;
    const url = previewId ? urlFor(previewId) : "";
    const f = row.file_id ? fileById(row.file_id) : null;
    const isPdf = f && (/pdf$/i.test(f.mime_type) || /\.pdf$/i.test(f.original_name));
    return `<div class="gallery-tile" data-action="open-row" data-page="${esc(key)}" data-id="${esc(row.id)}" style="cursor:pointer">
      ${url ? `<img src="${esc(url)}" alt="${esc(row[s.title] || "")}" loading="lazy"/>`
            : `<div class="image-preview empty" style="width:100%;height:100%;border-radius:0;border:none;">${icon("image",22)}</div>`}
      ${row.category ? `<span class="cat-tag">${esc(row.category)}</span>` : ""}
      ${isPdf ? `<span class="pdf-badge" data-action="view-file" data-file="${esc(row.file_id)}" data-stop="1">PDF</span>` : ""}
      ${isStaff() && row.visibility === "internal" ? `<span class="pdf-badge" style="background:rgba(80,76,70,.92);left:auto;right:8px;bottom:34px;">INTERNAL</span>` : ""}
      <span class="cap">${esc(String(row[s.title] || "").slice(0, 60))}</span>
    </div>`;
  }

  /* ---- contact & legal, settings, access -------------------------- */

  function block(title, body) {
    if (!String(body || "").trim()) return "";
    return `<div class="card" style="margin-bottom:14px;">
      <div class="section-title" style="margin:0 0 8px;">${esc(title)}</div>
      <div class="legal-prose">${esc(body)}</div></div>`;
  }

  function infoHtml() {
    const rows = [["Phone", SETTINGS.phone], ["Email", SETTINGS.email], ["Website", SETTINGS.website],
                  ["Office hours", SETTINGS.office_hours], ["Address", SETTINGS.address]].filter((r) => String(r[1] || "").trim());
    return `
      <div class="page-head"><div><div class="eyebrow">Portal</div>
        <h1 class="page-title">Contact &amp; Legal</h1>
        <p class="page-sub">How to reach us, and how your information is handled.</p></div></div>
      <div class="card" style="margin-bottom:14px;">
        <div class="section-title" style="margin:0 0 10px;">${esc(SETTINGS.company_name || CFG.companyName)}</div>
        ${rows.length ? `<div class="info-grid">${rows.map((r) => `<div><div class="info-label">${esc(r[0])}</div><div class="info-value">${esc(r[1])}</div></div>`).join("")}</div>`
                      : emptyState("Contact details haven't been filled in yet.")}
        ${SETTINGS.support_note ? `<div class="legal-prose" style="margin-top:14px;">${esc(SETTINGS.support_note)}</div>` : ""}
      </div>
      ${block("Privacy Notice", SETTINGS.privacy_notice)}
      ${block("Terms of Use", SETTINGS.terms_of_use)}
      ${block("Client Data Consent", SETTINGS.data_consent)}
      ${block("Data Retention & Access", SETTINGS.data_retention)}`;
  }

  function projectPageHtml() {
    const p = project();
    const admin = hasRole(["managing_director", "project_manager", "system_admin"]);
    return `<div class="page-head"><div><div class="eyebrow">${isStaff() ? "Stanza Team" : "Client Portal"}</div>
        <h1 class="page-title">Project Info</h1>
        <p class="page-sub">${esc(p.code || "")}</p></div>
        ${admin ? `<button class="btn btn-primary" data-action="save-project" ${UI.busy ? "disabled" : ""}>${icon("check",14)} ${UI.busy ? "Saving…" : "Save"}</button>` : ""}</div>
      <div class="card" id="project-form">${renderFields(PROJECT_FIELDS, p, !admin)}</div>`;
  }

  const SETTINGS_FIELDS = [
    { key: "company_name", label: "Company name", full: true },
    { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
    { key: "website", label: "Website" }, { key: "office_hours", label: "Office hours" },
    { key: "address", label: "Office address", full: true, type: "textarea" },
    { key: "support_note", label: "How to reach us about a project", full: true, type: "textarea" },
    { key: "privacy_notice", label: "Privacy Notice", full: true, type: "textarea" },
    { key: "terms_of_use", label: "Terms of Use", full: true, type: "textarea" },
    { key: "data_consent", label: "Client Data Consent", full: true, type: "textarea" },
    { key: "data_retention", label: "Data Retention & Access", full: true, type: "textarea" },
  ];

  function settingsHtml() {
    return `<div class="page-head"><div><div class="eyebrow">Admin</div>
        <h1 class="page-title">Portal Settings</h1>
        <p class="page-sub">Shown to every client on every project.</p></div>
        <button class="btn btn-primary" data-action="save-settings" ${UI.busy ? "disabled" : ""}>${icon("check",14)} ${UI.busy ? "Saving…" : "Save"}</button></div>
      <div class="card" id="settings-form">${renderFields(SETTINGS_FIELDS, SETTINGS, false)}</div>`;
  }

  function accessHtml() {
    const members = D.__members || [];
    return `<div class="page-head"><div><div class="eyebrow">Admin</div>
        <h1 class="page-title">Project Access</h1>
        <p class="page-sub">Who can open <strong>${esc(project().name)}</strong>. Removing someone here removes their access immediately.</p></div>
        <button class="btn btn-primary" data-action="add-member">${icon("plus",14)} Give someone access</button></div>
      ${members.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Since</th><th></th></tr></thead><tbody>
        ${members.map((m) => `<tr>
          <td><strong>${esc(m.full_name || "—")}</strong></td>
          <td>${esc(m.email || "—")}</td>
          <td>${esc(m.kind === "staff" ? (m.role || "staff").replace(/_/g, " ") : "client")}</td>
          <td>${fmtDate(m.granted_at)}</td>
          <td><div class="row-actions"><button class="btn btn-sm btn-ghost btn-danger" data-action="revoke-member" data-id="${esc(m.user_id)}">Remove</button></div></td>
        </tr>`).join("")}</tbody></table></div>` : emptyState("Nobody has been given access yet.")}
      <div class="card" style="margin-top:16px;">
        <div class="section-title" style="margin:0 0 6px;">Adding a client</div>
        <p class="helper-text" style="line-height:1.7;">The person needs an account first. Create it in Supabase → Authentication → Users → Add user (turn on “Auto Confirm User”), then come back here and give them access by email. They can set their own password using “Forgot your password?” on the sign-in page.</p>
      </div>`;
  }

  async function loadMembers() {
    if (!isStaff() || !UI.projectId) { D.__members = []; return; }
    const { data: mem } = await SB.from("project_members").select("*").eq("project_id", UI.projectId).is("revoked_at", null);
    const ids = (mem || []).map((m) => m.user_id);
    if (!ids.length) { D.__members = []; return; }
    const { data: profs } = await SB.from("profiles").select("*").in("id", ids);
    D.__members = (mem || []).map((m) => Object.assign({}, m,
      (profs || []).find((p) => p.id === m.user_id) || {}));
  }

  /* ---- fields ------------------------------------------------------ */

  function renderFields(fields, values, readOnly) {
    const visible = fields.filter((f) => {
      if (f.staffOnly && !isStaff()) return false;
      return true;
    });
    return `<div class="form-grid">${visible.map((f) => fieldHtml(f, values[f.key], readOnly && !(f.clientEditable && !isStaff()))).join("")}</div>`;
  }

  function fieldHtml(f, value, readOnly) {
    const dis = readOnly ? "disabled" : "";
    const cls = f.full ? "span-2" : "";
    let c;
    if (f.type === "textarea") {
      c = `<textarea data-field="${esc(f.key)}" ${dis}>${esc(value)}</textarea>`;
    } else if (f.type === "select") {
      c = `<select data-field="${esc(f.key)}" ${dis}>${f.options.map((o) =>
        `<option value="${esc(o)}" ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    } else if (f.type === "number") {
      c = `<input type="number" data-field="${esc(f.key)}" value="${value === null || value === undefined ? "" : esc(value)}" ${dis}/>`;
    } else if (f.type === "date") {
      c = `<input type="date" data-field="${esc(f.key)}" value="${esc(String(value || "").slice(0,10))}" ${dis}/>`;
    } else if (f.type === "time") {
      c = `<input type="time" data-field="${esc(f.key)}" value="${esc(String(value || "").slice(0,5))}" ${dis}/>`;
    } else if (f.type === "url") {
      const link = /^https?:\/\//i.test(String(value || "").trim()) ? String(value).trim() : "";
      c = readOnly
        ? (link ? `<div class="pdf-card"><div class="pdf-glyph">LINK</div><div class="pdf-meta"><div class="pdf-name">External link</div>
             <div class="pdf-sub">${esc(link.slice(0,70))}</div></div><div class="pdf-actions">
             <a class="btn btn-sm btn-primary" href="${esc(link)}" target="_blank" rel="noopener">Open</a></div></div>`
           : `<div class="pdf-card empty"><div class="pdf-glyph">LINK</div><div class="pdf-meta"><div class="pdf-name">No link</div></div></div>`)
        : `<div class="stack-sm"><input type="url" data-field="${esc(f.key)}" value="${esc(value || "")}" placeholder="https://drive.google.com/…" ${dis}/>
           ${link ? `<a class="helper-text" href="${esc(link)}" target="_blank" rel="noopener">Open link ↗</a>` : `<span class="helper-text">Paste a shareable link for very large files.</span>`}</div>`;
    } else if (f.type === "file" || f.type === "image") {
      c = attachmentField(f, readOnly);
    } else {
      c = `<input type="text" data-field="${esc(f.key)}" value="${esc(value || "")}" ${dis}/>`;
    }
    return `<div class="field ${cls}"><label>${esc(f.label)}</label>${c}</div>`;
  }

  function attachmentField(f, readOnly) {
    const m = UI.modal;
    const fileKey = f.fileKey || (f.key === "__preview" ? (SCHEMA[m.page].preview || "file_id") : "file_id");
    const fid = m.draft[fileKey];
    const rec = fid ? fileById(fid) : null;
    const isImg = f.type === "image";
    const url = rec ? urlFor(fid) : "";
    return `<div class="pdf-field">
      ${rec ? `<div class="pdf-card">
          ${isImg && url ? `<img class="image-preview" src="${esc(url)}" alt=""/>` : `<div class="pdf-glyph">${isImg ? "IMG" : "FILE"}</div>`}
          <div class="pdf-meta"><div class="pdf-name">${esc(rec.original_name)}</div>
            <div class="pdf-sub">${esc(fmtBytes(rec.size_bytes))}${rec.visibility === "internal" ? " · internal only" : ""}</div></div>
          <div class="pdf-actions">
            ${/pdf/i.test(rec.mime_type) ? `<button type="button" class="btn btn-sm" data-action="view-file" data-file="${esc(fid)}">${icon("eye",13)} View</button>` : ""}
            <button type="button" class="btn btn-sm btn-primary" data-action="download-file" data-file="${esc(fid)}">${icon("download",13)} Download</button>
            ${!readOnly ? `<button type="button" class="btn btn-sm btn-ghost btn-danger" data-action="detach-file" data-filekey="${esc(fileKey)}">Remove</button>` : ""}
          </div></div>`
        : `<div class="pdf-card empty"><div class="pdf-glyph">${isImg ? "IMG" : "FILE"}</div>
            <div class="pdf-meta"><div class="pdf-name">Nothing attached</div>
            <div class="pdf-sub">${readOnly ? "" : "Up to " + fmtBytes(MAX_UPLOAD) + "."}</div></div></div>`}
      ${!readOnly ? `<input type="file" ${isImg ? 'accept="image/*"' : ""} data-upload="${esc(fileKey)}" data-imgmode="${isImg ? "1" : ""}"/>` : ""}
    </div>`;
  }

  function readFields(container, fields) {
    const out = {};
    fields.forEach((f) => {
      if (f.type === "file" || f.type === "image") return;
      const el = container.querySelector(`input[data-field="${f.key}"], select[data-field="${f.key}"], textarea[data-field="${f.key}"]`);
      if (!el || typeof el.value !== "string") return;
      out[f.key] = f.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value;
    });
    return out;
  }

  /* ---- modal ------------------------------------------------------- */

  function modalHtml() {
    const m = UI.modal;
    if (m.kind === "progress") {
      return wrapModal("Record progress", `<div class="modal-body" id="row-form">
        ${renderFields(PROGRESS_FIELDS, m.draft, false)}</div>`,
        `<span></span><div style="display:flex;gap:8px;">
          <button class="btn" data-action="close-modal">Cancel</button>
          <button class="btn btn-primary" data-action="save-progress" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Saving…" : "Save"}</button></div>`);
    }
    if (m.kind === "newproject") {
      return wrapModal("New project", `<div class="modal-body" id="row-form">
        ${renderFields(NEW_PROJECT_FIELDS, m.draft, false)}</div>`,
        `<span></span><div style="display:flex;gap:8px;">
          <button class="btn" data-action="close-modal">Cancel</button>
          <button class="btn btn-primary" data-action="save-new-project" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Creating…" : "Create project"}</button></div>`);
    }
    if (m.kind === "member") {
      return wrapModal("Give someone access", `<div class="modal-body" id="row-form">
        <div class="field span-2"><label>Their email address</label>
          <input type="email" data-field="email" placeholder="person@example.com"/>
          <span class="helper-text" style="margin-top:6px;">They must already have an account. If not, create one in Supabase first.</span></div>
        </div>`,
        `<span></span><div style="display:flex;gap:8px;">
          <button class="btn" data-action="close-modal">Cancel</button>
          <button class="btn btn-primary" data-action="save-member" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Adding…" : "Give access"}</button></div>`);
    }

    const s = SCHEMA[m.page];
    const readOnly = !canEdit();
    const title = m.isNew ? "Add " + s.label.replace(/s$/, "") : (m.draft[s.title] || s.label);
    return wrapModal(String(title).slice(0, 70),
      `<div class="modal-body" id="row-form">${renderFields(s.fields, m.draft, readOnly)}</div>`,
      `${canEdit() && !m.isNew ? `<button class="btn btn-ghost btn-danger" data-action="delete-row">${icon("trash",14)} Delete</button>` : "<span></span>"}
       <div style="display:flex;gap:8px;">
         <button class="btn" data-action="close-modal">${readOnly && !hasClientEditable(s) ? "Close" : "Cancel"}</button>
         ${(!readOnly || hasClientEditable(s)) ? `<button class="btn btn-primary" data-action="save-row" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Saving…" : "Save"}</button>` : ""}
       </div>`);
  }
  function hasClientEditable(s) { return s.fields.some((f) => f.clientEditable); }

  function wrapModal(title, body, foot) {
    return `<div class="modal-overlay" data-action="close-modal"><div class="modal">
      <div class="modal-head"><div class="modal-title">${esc(title)}</div>
        <button class="icon-btn" data-action="close-modal" aria-label="Close">${icon("close")}</button></div>
      ${body}<div class="modal-foot">${foot}</div></div></div>`;
  }

  const NEW_PROJECT_FIELDS = [
    { key: "name", label: "Project name", full: true },
    { key: "code", label: "Project code (must be unique)" },
    { key: "client_company", label: "Client company", full: true },
  ];

  const PROGRESS_FIELDS = [
    { key: "overall_pct", label: "Overall complete (%)", type: "number" },
    { key: "planned_pct", label: "Planned by now (%)", type: "number" },
    { key: "schedule_status", label: "Schedule", type: "select", options: SELECT.scheduleStatus },
    { key: "budget_status", label: "Budget", type: "select", options: SELECT.budgetStatus },
    { key: "recorded_on", label: "Date", type: "date" },
    { key: "note", label: "Note for the client", full: true, type: "textarea" },
  ];

  /* ---- PDF viewer -------------------------------------------------- */

  function pdfViewerHtml() {
    const v = UI.pdfView;
    return `<div class="pdf-viewer-overlay" data-action="close-pdf-bg"><div class="pdf-viewer">
      <div class="pdf-viewer-head"><span style="color:var(--danger);display:flex;">${icon("pdf",18)}</span>
        <div class="pdf-viewer-title">${esc(v.name)}</div>
        <button class="btn btn-sm" data-action="download-file" data-file="${esc(v.fileId)}">${icon("download",13)} Download</button>
        <button class="icon-btn" data-action="close-pdf" aria-label="Close">${icon("close")}</button></div>
      <div class="pdf-viewer-body">
        ${canPreviewPdf() ? `<object data="${esc(v.url)}" type="application/pdf"><iframe src="${esc(v.url)}" title="${esc(v.name)}"></iframe></object>`
          : `<div class="pdf-fallback"><span style="color:var(--text-faint);">${icon("pdf",34)}</span>
             <div>This browser can't show PDFs inside a page.</div>
             <button class="btn btn-primary" data-action="download-file" data-file="${esc(v.fileId)}">${icon("download",14)} Download</button></div>`}
      </div>
      <div class="pdf-viewer-foot"><span>${esc(v.size)}</span><span>Preview blank? Use Download.</span></div>
    </div></div>`;
  }
  function canPreviewPdf() { try { return navigator.pdfViewerEnabled !== false; } catch (e) { return true; } }

  async function openPdf(fileId) {
    const f = fileById(fileId);
    if (!f) return;
    let url = urlFor(fileId);
    if (!url) {
      const { data } = await SB.storage.from(BUCKET).createSignedUrl(f.storage_path, 3600);
      if (data) { SIGNED.set(f.storage_path, { url: data.signedUrl, at: Date.now() }); url = data.signedUrl; }
    }
    if (!url) { setBanner("error", "Couldn't open that file."); return; }
    UI.pdfView = { fileId, url, name: f.original_name, size: fmtBytes(f.size_bytes) };
    render();
  }

  /* ---------------------------------------------------------------- */
  /* Events                                                            */
  /* ---------------------------------------------------------------- */

  const searchRender = debounce((pos) => {
    render();
    const el = document.querySelector(".search-input");
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
  }, 250);

  function syncForm() {
    const ff = document.getElementById("row-form");
    if (!ff || !UI.modal) return;
    /* Modals come in two shapes: a `kind` (a one-off form) or a `page`
       (a record from one of the schema-driven tables). Anything with a
       kind reads its own fields at save time, so only the second shape
       is synced here — the earlier version fell through to
       SCHEMA[undefined] and threw on every click. */
    if (UI.modal.kind === "progress") Object.assign(UI.modal.draft, readFields(ff, PROGRESS_FIELDS));
    else if (UI.modal.kind) { /* newproject, member: read at save time */ }
    else if (SCHEMA[UI.modal.page]) Object.assign(UI.modal.draft, readFields(ff, SCHEMA[UI.modal.page].fields));
    const sf = document.getElementById("settings-form");
    if (sf) Object.assign(SETTINGS, readFields(sf, SETTINGS_FIELDS));
  }
  function syncProjectForm() {
    const pf = document.getElementById("project-form");
    if (pf && project()) Object.assign(project(), readFields(pf, PROJECT_FIELDS));
  }

  document.addEventListener("click", async (e) => {
    const anchor = e.target.closest("a[href]");
    if (anchor && !anchor.dataset.action && anchor.getAttribute("href") !== "#") return;
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if ((a === "close-modal" || a === "close-pdf-bg") && e.target !== t) return;
    if (a !== "search") {
      const sf = document.getElementById("settings-form");
      if (sf) Object.assign(SETTINGS, readFields(sf, SETTINGS_FIELDS));
      syncProjectForm();
      syncForm();
    }

    try {
      switch (a) {
        case "toggle-sidebar": UI.sidebarOpen = !UI.sidebarOpen; return render();
        case "close-sidebar": UI.sidebarOpen = false; return render();
        case "go-forgot": UI.screen = "forgot"; UI.authError = UI.authNote = null; return render();
        case "go-login": UI.screen = "login"; UI.authError = UI.authNote = null; return render();
        case "sign-in": return doSignIn();
        case "send-reset": return doSendReset();
        case "set-password": return doSetPassword();
        case "sign-out": return doSignOut();

        case "goto": {
          e.preventDefault();
          UI.page = t.dataset.page; UI.search = ""; UI.filter = "All"; UI.sidebarOpen = false; UI.banner = null;
          if (UI.page === "access") await loadMembers();
          return render();
        }
        case "set-filter": UI.filter = t.dataset.filter; return render();

        case "new-row": {
          const page = t.dataset.page, s = SCHEMA[page];
          const draft = {};
          s.fields.forEach((f) => { draft[f.key] = f.type === "select" ? f.options[0] : ""; });
          if (s.fields.some((f) => f.key === "visibility")) draft.visibility = "client";
          UI.modal = { page, id: null, isNew: true, draft };
          return render();
        }
        case "open-row": {
          const page = t.dataset.page, s = SCHEMA[page];
          const row = (D[s.table] || []).find((r) => String(r.id) === t.dataset.id);
          if (!row) return;
          UI.page = page;
          UI.modal = { page, id: row.id, isNew: false, draft: clone(row) };
          return render();
        }
        case "close-modal": UI.modal = null; return render();
        case "close-pdf": case "close-pdf-bg": UI.pdfView = null; return render();

        case "save-row": return saveModal();
        case "delete-row": {
          if (!confirm("Delete this record? This cannot be undone.")) return;
          const s = SCHEMA[UI.modal.page];
          UI.busy = true; render();
          await deleteRow(s.table, UI.modal.id);
          UI.modal = null; UI.busy = false;
          await loadProjectData();
          return setBanner("saved", "Deleted.");
        }

        case "view-file": e.preventDefault(); return openPdf(t.dataset.file);
        case "download-file": e.preventDefault(); return downloadFile(t.dataset.file);
        case "detach-file": {
          e.preventDefault();
          UI.modal.draft[t.dataset.filekey] = null;
          return render();
        }

        case "record-progress":
          UI.modal = { kind: "progress", draft: {
            overall_pct: (D.progress_snapshots[0] || {}).overall_pct || 0,
            planned_pct: (D.progress_snapshots[0] || {}).planned_pct || 0,
            schedule_status: "On Track", budget_status: "On Track",
            recorded_on: new Date().toISOString().slice(0, 10), note: "" } };
          return render();
        case "save-progress": {
          UI.busy = true; render();
          const p = Object.assign({}, UI.modal.draft, { project_id: UI.projectId, recorded_by: ME.id });
          const { error } = await SB.from("progress_snapshots").insert(p);
          UI.busy = false; UI.modal = null;
          if (error) return setBanner("error", error.message);
          await loadProjectData();
          return setBanner("saved", "Progress recorded.");
        }

        case "save-settings": {
          UI.busy = true; render();
          const payload = {}; SETTINGS_FIELDS.forEach((f) => { payload[f.key] = SETTINGS[f.key] ?? ""; });
          const { error } = await SB.from("portal_settings").update(payload).eq("id", 1);
          UI.busy = false;
          if (error) return setBanner("error", error.message);
          await loadSettings();
          return setBanner("saved", "Saved.");
        }

        case "save-project": {
          UI.busy = true; render();
          const p = project();
          const payload = {};
          PROJECT_FIELDS.forEach((f) => { payload[f.key] = p[f.key] === "" ? null : p[f.key]; });
          const { error } = await SB.from("projects").update(payload).eq("id", p.id);
          UI.busy = false;
          if (error) return setBanner("error", error.message);
          await loadProjects();
          return setBanner("saved", "Project details saved.");
        }
        case "new-project":
          UI.modal = { kind: "newproject", draft: { name: "", code: "", client_company: "" } };
          return render();
        case "save-new-project": {
          const ff = document.getElementById("row-form");
          const d = readFields(ff, NEW_PROJECT_FIELDS);
          if (!d.name || !d.code) return setBanner("error", "A project needs a name and a code.");
          UI.busy = true; render();
          let clientId = null;
          if (d.client_company) {
            const { data: c, error: ce } = await SB.from("clients")
              .insert({ company_name: d.client_company }).select().single();
            if (ce) { UI.busy = false; return setBanner("error", ce.message); }
            clientId = c.id;
          }
          const { data: proj, error } = await SB.from("projects")
            .insert({ name: d.name, code: d.code, client_id: clientId }).select().single();
          UI.busy = false; UI.modal = null;
          if (error) return setBanner("error", error.message);
          await loadProjects();
          UI.projectId = proj.id;
          await loadProjectData();
          UI.page = "project";
          return setBanner("saved", "Project created. You have been added to it automatically.");
        }

        case "add-member": UI.modal = { kind: "member", draft: {} }; return render();
        case "save-member": {
          const el = document.querySelector('#row-form input[data-field="email"]');
          const email = (el && el.value || "").trim().toLowerCase();
          if (!email) return setBanner("error", "Please enter an email address.");
          UI.busy = true; render();
          const { data: prof } = await SB.from("profiles").select("id, full_name").ilike("email", email).maybeSingle();
          if (!prof) { UI.busy = false; return setBanner("error", "No account with that email yet. Create it in Supabase first, then try again."); }
          const { error } = await SB.from("project_members").insert({ project_id: UI.projectId, user_id: prof.id, granted_by: ME.id });
          UI.busy = false; UI.modal = null;
          if (error) return setBanner("error", error.message);
          await loadMembers();
          return setBanner("saved", "Access granted to " + (prof.full_name || email) + ".");
        }
        case "revoke-member": {
          if (!confirm("Remove this person's access to the project?")) return;
          const { error } = await SB.from("project_members").update({ revoked_at: new Date().toISOString() })
            .eq("project_id", UI.projectId).eq("user_id", t.dataset.id);
          if (error) return setBanner("error", error.message);
          await loadMembers();
          return setBanner("saved", "Access removed.");
        }
      }
    } catch (err) {
      UI.busy = false;
      setBanner("error", (err && err.message) || "Something went wrong.");
    }
  });

  async function saveModal() {
    const m = UI.modal, s = SCHEMA[m.page];
    UI.busy = true; render();
    try {
      await saveRow(s.table, m.draft, m.id);
      UI.modal = null; UI.busy = false;
      await loadProjectData();
      setBanner("saved", "Saved.");
    } catch (err) {
      UI.busy = false;
      setBanner("error", err.message || "Couldn't save that.");
    }
  }

  document.addEventListener("change", async (e) => {
    if (e.target.matches('[data-action="switch-project"]')) {
      UI.projectId = e.target.value; UI.page = "overview"; UI.search = ""; UI.filter = "All";
      render();
      await loadProjectData();
      return render();
    }
    const up = e.target.closest("[data-upload]");
    if (up && up.files && up.files[0]) {
      const fileKey = up.dataset.upload;
      const file = up.files[0];
      syncForm();
      UI.busy = true; render();
      try {
        const s = SCHEMA[UI.modal.page];
        const category = up.dataset.imgmode ? (UI.modal.page === "site_media" ? "site_photo" : "design")
                                            : guessCategory(UI.modal.page);
        const vis = UI.modal.draft.visibility || "internal";
        const rec = await uploadFile(file, category, vis);
        UI.modal.draft[fileKey] = rec.id;
        UI.busy = false;
        render();
      } catch (err) {
        UI.busy = false;
        setBanner("error", err.message || "Upload failed.");
      }
    }
  });
  function guessCategory(page) {
    return ({ design_revisions: "design", documents: "contract", invoices: "invoice",
              quotations: "quotation", meetings: "meeting_minutes", site_media: "site_photo",
              materials: "material_sample", variation_orders: "other" })[page] || "other";
  }

  document.addEventListener("input", (e) => {
    if (e.target.classList && e.target.classList.contains("search-input")) {
      UI.search = e.target.value;
      searchRender(e.target.selectionStart);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && UI.pdfView) { UI.pdfView = null; return render(); }
    if (e.key === "Escape" && UI.modal) { UI.modal = null; return render(); }
    if (e.key === "Enter" && (e.target.id === "f-password" || e.target.id === "f-email")) {
      e.preventDefault();
      if (UI.screen === "login") doSignIn();
      else if (UI.screen === "forgot") doSendReset();
    }
  });

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */

  async function enterApp() {
    UI.screen = "loading"; render();
    const ok = await loadMe();
    if (!ok) { UI.screen = "login"; return render(); }
    await Promise.all([loadProjects(), loadSettings()]);
    await loadProjectData();
    UI.screen = "app"; UI.page = "overview";
    render();
  }

  async function boot() {
    // A password-recovery link lands here with a session already attached.
    SB.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { UI.screen = "reset"; UI.authError = null; render(); }
    });
    const { data: { session } } = await SB.auth.getSession();
    const hash = window.location.hash || "";
    if (/type=recovery/.test(hash)) { UI.screen = "reset"; return render(); }
    if (session) return enterApp();
    UI.screen = "login"; render();
  }

  boot();
})();
