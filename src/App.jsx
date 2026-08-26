import { useState, useEffect, useRef } from "react";
import { Zap, Trophy, Clock, ChevronRight, ShieldCheck, Lock, AlertCircle, PartyPopper, Award, Pencil, Trash2, Plus, ImagePlus, Check, X, User, Phone, Flag, Rocket, Crown, Flame, Sparkles, Menu, Home, Save } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, runTransaction } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAuLh1JyGuGyKW72W0P17kdVlZbVsDDRxc",
  authDomain: "hiraldo-power.firebaseapp.com",
  projectId: "hiraldo-power",
  storageBucket: "hiraldo-power.firebasestorage.app",
  messagingSenderId: "435721767032",
  appId: "1:435721767032:web:9032ec6acac0a269e6058d"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

const dbGet = async (key, def) => {
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject("timeout"), 5000));
    const snap = await Promise.race([getDoc(doc(db, "hiraldopower", key)), timeout]);
    return snap.exists() ? snap.data().value : def;
  } catch { return def; }
};

const dbSet = async (key, val) => {
  try {
    await setDoc(doc(db, "hiraldopower", key), { value: val });
    return true;
  } catch (e) {
    console.error("Firebase dbSet error:", key, e?.message || e);
    return false;
  }
};

// Genera el número de boleto con la cantidad de dígitos correcta según el
// total de boletos de la rifa (3 dígitos para 1,000 = Pick 3, 4 dígitos
// para 10,000 = Pick 4, etc.), en vez de forzar siempre 3 dígitos.
const generarBoletosRifa = (total) => {
  const w = String(Math.max(0, total - 1)).length;
  const o = {};
  for (let i = 0; i < total; i++) o[String(i).padStart(w, "0")] = null;
  return o;
};

// Cada rifa guarda sus boletos en su PROPIO documento de Firebase
// ("tickets_<idDeLaRifa>") en vez de todas juntas en un solo documento.
// Esto evita chocar con el límite de 1MB por documento de Firebase cuando
// una rifa tiene muchos boletos (ej. 10,000 en Pick 4) o cuando se acumulan
// varias rifas. Si el documento nuevo todavía no existe, migra automáticamente
// lo que hubiera en el formato antiguo (todas las rifas en un solo documento).
// Lee/guarda el pool de boletos de una rifa como UN SOLO TEXTO (JSON), no como
// mapa nativo de Firestore. Guardarlo como mapa nativo con miles de llaves hace
// que Firestore intente indexar cada boleto por separado, y al llegar a varios
// miles de boletos vendidos choca con el límite de "too many index entries"
// de Firestore. Como texto plano, Firestore lo trata como un solo campo y ese
// límite deja de aplicar, sin importar cuántos boletos tenga la rifa.
const leerPoolBoletos = async (rifaId) => {
  const raw = await dbGet("tickets_" + rifaId, null);
  if (!raw) return null;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return null; } }
  return raw; // formato antiguo (mapa nativo guardado antes de este cambio)
};
const guardarPoolBoletos = (rifaId, pool) => dbSet("tickets_" + rifaId, JSON.stringify(pool));

const cargarTodosLosBoletos = async (listaRifas) => {
  const legacy = await dbGet("tickets", null);
  const esFormatoPlanoViejo = legacy && Object.keys(legacy).length > 0 && Object.keys(legacy).every(k => /^\d{3}$/.test(k));
  const b = {};
  for (const rifa of (listaRifas || [])) {
    let pool = await leerPoolBoletos(rifa.id);
    if (!pool && legacy) {
      if (legacy[rifa.id]) pool = legacy[rifa.id];
      else if (esFormatoPlanoViejo && listaRifas[0]?.id === rifa.id) pool = legacy;
      if (pool) await guardarPoolBoletos(rifa.id, pool); // migración: se guarda ya en el nuevo formato
    }
    if (!pool) pool = generarBoletosRifa(rifa.totalBoletos);
    b[rifa.id] = pool;
  }
  return b;
};

/* ============================================================
   HIRALDO POWER — Catálogo de Rifas
   Las rifas se gestionan desde el Panel Admin (no editar aquí)
   ============================================================ */

const RIFAS_INICIALES = [
  {
    id: "scooter-julio",
    titulo: "Scooter Eléctrica",
    subtitulo: "Sorteo 18 de julio 2026 · Carretera Verón, Sector La Gallera",
    categoria: "motos",
    precio: 150,
    minBoletos: 1,
    totalBoletos: 1000,
    fechaSorteo: "2026-07-18",
    imagen: "",
    etiqueta: "🔥 POPULAR",
    etiquetaColor: "#FF6B35",
    activa: true,
    descripcion: "Una scooter eléctrica moderna para moverte sin gasolina. 1,000 boletos en juego. Los números se asignan al azar al validar tu pago.",
  },
];

const MENSAJE_WHATSAPP_INICIAL = `¡Hola {nombre}! 🎉 Gracias por participar en las Rifas de Hiraldo Power by Kenny Hiraldo.

Jugaste en: "{rifa}"
{numeros}
{lineaPower}
Guarda este mensaje como comprobante. ¡Mucha suerte en el sorteo! Sigue participando, cada boleto es una nueva oportunidad de ganar 🍀

Síguenos para enterarte de nuevas rifas y sorteos en vivo:
📸 Instagram: {instagram}
👤 Facebook: {facebook}`;

const SITE_CONFIG_INICIAL = {
  marca: "HIRALDO POWER",
  logoUrl: "",
  badgeHero: "HIRALDO POWER · RIFAS EN VIVO",
  tituloHero1: "CATÁLOGO",
  tituloHero2: "DE RIFAS",
  subtituloHero: "Selecciona tu artículo soñado y asegura tu oportunidad.",
  footerTexto: "Rifas en vivo y verificables",
  colorAcento: "#C6FF3D",
  colorTitulo1: "#F2F2EF",
  instagram: "@kennyhiraldo22",
  facebook: "Kenny Antonio Hiraldo Balbuena",
  mensajeWhatsapp: MENSAJE_WHATSAPP_INICIAL,
  codigoEfectivo: "0000",
};


// ---- Números Power: boletos "premiados" que dan RD$1,000 al instante ----
// (Se asignan al azar como cualquier otro boleto; esta lista solo se usa
// para detectar en el admin cuando alguno de estos números fue vendido.)
const POWER_NUMBERS_INICIAL = ["7346", "2891", "6072", "4519", "3785"];
const PREMIO_POWER_MONTO = 1000;

const CATEGORIAS = ["motos", "autos", "efectivo", "tech", "otro"];

const COLORES_RIFA = ["#C6FF3D", "#818cf8", "#FF6B35", "#ec4899", "#22d3ee", "#f59e0b", "#a78bfa", "#34d399"];

/* ---- Sistema de niveles de combos (paquetes de boletos) ---- */
const ICONOS_COMBO = {
  bandera: Flag,
  cohete: Rocket,
  trofeo: Trophy,
  corona: Crown,
  rayo: Zap,
  llama: Flame,
  estrella: Sparkles,
};
const COLORES_COMBO = ["#22c55e", "#eab308", "#22d3ee", "#3b82f6", "#f59e0b", "#ef4444", "#a78bfa", "#ec4899"];
const PLANTILLA_COMBOS = [
  { nombre: "AMATEUR", icono: "bandera", color: "#22c55e", cantidad: 5,   etiqueta: "" },
  { nombre: "PRO",     icono: "cohete",  color: "#eab308", cantidad: 10,  etiqueta: "POPULAR" },
  { nombre: "ELITE",   icono: "trofeo",  color: "#22d3ee", cantidad: 15,  etiqueta: "" },
  { nombre: "CAMPEÓN", icono: "corona",  color: "#3b82f6", cantidad: 25,  etiqueta: "" },
  { nombre: "LEYENDA", icono: "rayo",    color: "#f59e0b", cantidad: 50,  etiqueta: "VIP" },
  { nombre: "MÍTICO",  icono: "llama",   color: "#ef4444", cantidad: 100, etiqueta: "MAXIMO" },
];

const METODOS_PAGO_INICIALES = [
  { id: "mp-1", tipo: "banco", nombre: "Banco Popular", titular: "Hiraldo Power", cuenta: "809-555-0118", activo: true },
  { id: "mp-2", tipo: "efectivo", nombre: "Efectivo (en persona)", titular: "", cuenta: "", activo: true },
];

function fmtMoney(n) { return "RD$" + Number(n).toLocaleString("es-DO"); }

// Redimensiona una imagen (dataURL) a un tamaño máximo, conservando
// transparencia (PNG). Se usa para el logo del sitio y el logo de cada
// método de pago antes de guardarlo.
function comprimirImagen(dataUrl, maxPx, cb) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    let w = img.width, h = img.height;
    if (w > maxPx || h > maxPx) {
      if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
      else { w = Math.round(w * maxPx / h); h = maxPx; }
    }
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    cb(canvas.toDataURL("image/png"));
  };
  img.src = dataUrl;
}

// Convierte un teléfono como "809-555-1234" al formato que necesita wa.me
// (solo dígitos, con el código de país 1 si el número no lo trae ya).
function normalizarTelefono(tel) {
  const digitos = (tel || "").replace(/\D/g, "");
  if (digitos.length === 10) return "1" + digitos;
  return digitos;
}

// Arma el mensaje de agradecimiento + números asignados que el admin envía
// por WhatsApp con un toque, tras aprobar una compra.
function mensajeAvisoNumeros({ nombre, asignados, rifaTitulo, ganadoresPower }, siteConfig) {
  const primerNombre = (nombre || "").trim().split(" ")[0] || "";
  const numeros = `Tu${asignados.length>1?"s números son":" número es"}: ${asignados.map(n=>"#"+n).join(", ")}`;
  const lineaPower = (ganadoresPower && ganadoresPower.length>0)
    ? `⚡ ¡Felicidades! Uno de tus números (${ganadoresPower.map(n=>"#"+n).join(", ")}) es un Número Power y ganaste RD$${PREMIO_POWER_MONTO.toLocaleString("es-DO")} en efectivo al instante. Nos pondremos en contacto contigo para coordinar el pago.\n`
    : "";
  const plantilla = siteConfig?.mensajeWhatsapp || MENSAJE_WHATSAPP_INICIAL;
  return plantilla
    .replaceAll("{nombre}", primerNombre)
    .replaceAll("{rifa}", rifaTitulo || "")
    .replaceAll("{numeros}", numeros)
    .replaceAll("{lineaPower}", lineaPower)
    .replaceAll("{instagram}", siteConfig?.instagram || "")
    .replaceAll("{facebook}", siteConfig?.facebook || "");
}

// Devuelve true si la fecha/hora del sorteo ya pasó (tiempo agotado)
function sorteoVencido(fechaStr, hora) {
  if (!fechaStr) return false;
  const [y, m, d] = fechaStr.split("-").map(Number);
  const [hh, mm] = (hora || "23:59").split(":").map(Number);
  const fechaLocal = new Date(y, m - 1, d, hh, mm, 0);
  return fechaLocal.getTime() <= Date.now();
}

/* ---- Countdown ---- */
function Countdown({ fechaStr, hora }) {
  const calc = () => {
    // Parsear como hora local de RD
    const [y,m,d] = fechaStr.split("-").map(Number);
    const [hh,mm] = (hora||"23:59").split(":").map(Number);
    const fechaLocal = new Date(y, m-1, d, hh, mm, 0);
    const diff = Math.max(0, fechaLocal - new Date());
    return { d: Math.floor(diff/86400000), h: Math.floor((diff%86400000)/3600000), m: Math.floor((diff%3600000)/60000), s: Math.floor((diff%60000)/1000) };
  };
  const [t, setT] = useState(calc);
  useEffect(() => { const id = setInterval(() => setT(calc()), 1000); return () => clearInterval(id); }, []);
  const [_y,_m,_d] = fechaStr.split("-").map(Number);
  const [_hh,_mm] = (hora||"23:59").split(":").map(Number);
  const _fechaLocal = new Date(_y, _m-1, _d, _hh, _mm, 0);
  const dias = Math.ceil((_fechaLocal - new Date()) / 86400000);
  const urg = dias <= 3;
  return (
    <div style={{ background: urg ? "rgba(245,158,11,0.05)" : "#0D0F12", border: `1px solid ${urg ? "rgba(245,158,11,0.4)" : "#232830"}`, borderRadius: 8, padding: "8px 12px" }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.8px", color: urg ? "#f59e0b" : "#C6FF3D", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
        <Zap size={9} /> {urg ? "¡FALTAN POCOS DÍAS!" : "EL SORTEO COMIENZA EN"}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {[["d","DÍAS"],["h","HRS"],["m","MIN"],["s","SEG"]].map(([k,lbl]) => (
          <div key={k} style={{ textAlign: "center", minWidth: 32 }}>
            <span style={{ display: "block", fontFamily: "'Arial Black',sans-serif", fontSize: 20, color: urg ? "#f59e0b" : "#F2F2EF", lineHeight: 1 }}>{String(t[k]).padStart(2,"0")}</span>
            <span style={{ display: "block", fontSize: 7, color: "#9AA1AC", letterSpacing: "0.5px" }}>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Progress ---- */
function ProgressBar({ vendidos, total }) {
  const pRaw = total>0 ? (vendidos/total)*100 : 0;
  const p = Math.min(100, Math.round(pRaw)); // para el ancho de la barra
  const agotadoReal = vendidos >= total;
  // El texto usa un decimal y nunca redondea a "100%" si en realidad quedan
  // boletos disponibles, para no confundir al cliente a la hora de comprar.
  const pTexto = agotadoReal ? "100" : Math.min(99.9, pRaw).toFixed(1);
  const color = p>=90?"#FF6B35":p>=60?"#f59e0b":"#C6FF3D";
  return (
    <div>
      <div style={{ height: 6, background: "#232830", borderRadius: 999, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${p}%`, background: color, borderRadius: 999, transition: "width .4s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9AA1AC", fontWeight: 700 }}>
        <span>PROGRESO: <strong style={{ color: "#F2F2EF" }}>{pTexto}%</strong></span>
        {agotadoReal && <span style={{ color: "#FF6B35" }}>¡AGOTADO!</span>}
      </div>
    </div>
  );
}

/* ---- Rifa Card ---- */
function RifaCard({ rifa, vendidosCount, onJugar }) {
  const vencida = sorteoVencido(rifa.fechaSorteo, rifa.horaSorteo || "23:59");
  const agotada = !rifa.activa || vendidosCount >= rifa.totalBoletos || vencida;
  return (
    <div style={{ background: "#14171C", border: `1px solid ${rifa.destacada ? "rgba(198,255,61,0.3)" : "#232830"}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", width: "100%" }}>
      <div style={{ paddingBottom: "62.5%", background: "#1a1d23", position: "relative", overflow: "hidden" }}>
        {rifa.imagen
          ? <img src={rifa.imagen} alt={rifa.titulo} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}><Trophy size={48} style={{ opacity: 0.15, color: "#9AA1AC" }} /></div>
        }
        {agotada && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ fontFamily: "'Arial Black',sans-serif", fontSize: 28, color: "#FF5470", border: "3px solid #FF5470", padding: "4px 14px", borderRadius: 6, transform: "rotate(-8deg)", letterSpacing: 2 }}>{vencida && vendidosCount < rifa.totalBoletos ? "CERRADO" : "AGOTADO"}</div>
          </div>
        )}
        {rifa.etiqueta && !agotada && (
          <span style={{ position: "absolute", top: 10, left: 10, background: rifa.etiquetaColor || "#FF6B35", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999, color: "#fff" }}>{rifa.etiqueta}</span>
        )}
      </div>
      <div style={{ padding: "16px 16px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontFamily: "'Arial Black',sans-serif", fontSize: 18, lineHeight: 1.2 }}>{rifa.titulo}</div>
        {rifa.subtitulo && <div style={{ fontSize: 11, color: "#9AA1AC" }}>{rifa.subtitulo}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#22c55e", fontWeight: 700 }}>
          <Clock size={11} /> Fecha sorteo: <strong>{(() => { const [y,m,d]=rifa.fechaSorteo.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric"}); })()}{rifa.horaSorteo ? " · "+rifa.horaSorteo+" hrs" : ""}</strong>
        </div>
        {!agotada && <Countdown fechaStr={rifa.fechaSorteo} hora={rifa.horaSorteo||"23:59"} />}
        <ProgressBar vendidos={vendidosCount} total={rifa.totalBoletos} />
        <div style={{ fontSize: 12, color: "#9AA1AC", lineHeight: 1.5 }}>{rifa.descripcion}</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto", paddingTop: 8 }}>
          <div>
            <div style={{ fontFamily: "'Arial Black',sans-serif", fontSize: 22 }}>{fmtMoney(rifa.precio)}</div>
            <div style={{ fontSize: 10, color: "#9AA1AC" }}>Mín. {rifa.minBoletos} boleto{rifa.minBoletos>1?"s":""}</div>
          </div>
          {agotada
            ? <button disabled style={{ border: "1px solid #FF5470", background: "#1a1d23", color: "#FF5470", fontSize: 11, fontWeight: 800, padding: "8px 14px", borderRadius: 8, opacity: 0.7, cursor: "not-allowed" }}>{vencida && vendidosCount < rifa.totalBoletos ? "CERRADO" : "AGOTADO"}</button>
            : <button onClick={onJugar} style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid #C6FF3D", background: "none", color: "#C6FF3D", fontSize: 12, fontWeight: 800, padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>JUGAR <ChevronRight size={14} /></button>
          }
        </div>
      </div>
    </div>
  );
}

/* ---- Tarjeta de boleto (número + comprador/teléfono enmascarados) ---- */
function maskNombre(nombre) {
  const n = (nombre || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!n) return "———";
  if (n.length <= 6) return n;
  return n.slice(0, 4) + "***" + n.slice(-2);
}
function maskTelefono(tel) {
  const d = (tel || "").replace(/\D/g, "");
  if (d.length < 6) return tel || "———";
  return d.slice(0, 4) + "****" + d.slice(-2);
}
function TicketCard({ numero, info, rifa }) {
  const etiqueta = rifa?.titulo || "Rifa";
  return (
    <div style={{ background: "linear-gradient(180deg,#0c1730 0%,#152647 100%)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 16, overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }}>
      <div style={{ width: "100%", height: 96, position: "relative", background: "#0c1730" }}>
        {rifa?.imagen ? (
          <img src={rifa.imagen} alt={etiqueta} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trophy size={26} style={{ color: "rgba(255,255,255,0.25)" }} />
          </div>
        )}
      </div>
      <div style={{ padding: "12px 14px 0" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#EAF0FA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {etiqueta}
        </div>
      </div>
      <div style={{ margin: "10px 14px 12px", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
        <span style={{ fontFamily: "'Arial Black',sans-serif", fontSize: 30, letterSpacing: 2, color: "#FFD24C" }}>{numero}</span>
      </div>
      <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#9FB0C8" }}>
          <User size={13} style={{ color: "#60A5FA", flexShrink: 0 }} /> {maskNombre(info?.nombre)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#9FB0C8" }}>
          <Phone size={13} style={{ color: "#F87171", flexShrink: 0 }} /> {maskTelefono(info?.telefono)}
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "#22c55e", display: "inline-block" }} />
        <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>Activo</span>
      </div>
    </div>
  );
}

/* ---- Verify ---- */
function Verify({ boletos, pendientes, rifas }) {
  const [tel, setTel] = useState("");
  const [resultado, setResultado] = useState(null);
  const [buscado, setBuscado] = useState(false);
  const rifaObj = (rifaId) => (rifas||[]).find(r=>r.id===rifaId);
  const tituloRifa = (rifaId) => rifaObj(rifaId)?.titulo || "Rifa";
  const buscar = () => {
    setBuscado(true);
    const aprobados = [];
    Object.entries(boletos||{}).forEach(([rifaId, pool]) => {
      Object.entries(pool||{}).forEach(([num,info]) => {
        if (info && info.telefono===tel.trim()) aprobados.push({ num, rifaId, info });
      });
    });
    const pend = (pendientes||[]).filter(p=>p.telefono===tel.trim()&&p.estado==="pendiente");
    setResultado({ aprobados, pendientes: pend });
  };
  return (
    <div style={{ maxWidth: resultado && resultado.aprobados.length>0 ? 1000 : 480, margin: "0 auto", padding: "40px 20px", transition:"max-width .2s" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "'Arial Black',sans-serif", fontSize: 22, marginBottom: 6 }}>VERIFICAR BOLETO</h2>
        <p style={{ color: "#9AA1AC", fontSize: 13, marginBottom: 24 }}>Ingresa el número de teléfono que usaste al comprar.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <input style={{ flex:1, background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", padding:"12px 14px", borderRadius:10, fontSize:14, outline:"none" }}
            placeholder="809-000-0000" value={tel} onChange={e=>setTel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()} />
          <button onClick={buscar} style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"12px 18px", borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <ShieldCheck size={16}/> Buscar
          </button>
        </div>
      </div>
      {buscado && resultado && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {resultado.aprobados.length>0 && (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <ShieldCheck size={18} style={{ color:"#C6FF3D" }} />
                <span style={{ fontWeight:700, fontSize:14 }}>Boletos aprobados ({resultado.aprobados.length})</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:18 }}>
                {resultado.aprobados.map(({num,rifaId,info})=>(
                  <TicketCard key={rifaId+"-"+num} numero={num} info={info} rifa={rifaObj(rifaId)} />
                ))}
              </div>
            </div>
          )}
          <div style={{ maxWidth: 480, width:"100%" }}>
          {resultado.pendientes.length>0 && (
            <div style={{ display:"flex", gap:12, background:"#14171C", border:"1px solid rgba(255,107,53,0.3)", borderRadius:12, padding:16 }}>
              <Clock size={18} style={{ color:"#FF6B35", flexShrink:0 }} />
              <div><div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>Pendientes de validación</div>
                {resultado.pendientes.map(p=><div key={p.id} style={{ fontSize:12, color:"#9AA1AC" }}>{p.cantidad} boleto{p.cantidad>1?"s":""} de {p.rifaTitulo||"rifa"} · {fmtMoney(p.total)}</div>)}
              </div>
            </div>
          )}
          {resultado.aprobados.length===0&&resultado.pendientes.length===0 && (
            <div style={{ display:"flex", gap:12, background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:16 }}>
              <AlertCircle size={18} style={{ color:"#9AA1AC", flexShrink:0 }} />
              <div style={{ fontSize:13 }}>No encontramos boletos con ese número.</div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Ganadores ---- */
function Ganadores({ historial }) {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 20px" }}>
      <h2 style={{ fontFamily: "'Arial Black',sans-serif", fontSize: 22, marginBottom: 6 }}>HISTORIAL DE GANADORES</h2>
      <p style={{ color: "#9AA1AC", fontSize: 13, marginBottom: 28 }}>Cada rifa de Hiraldo Power, sorteada en vivo y verificable.</p>
      {(!historial||historial.length===0) && (
        <div style={{ display:"flex", gap:12, background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:16, fontSize:13, color:"#9AA1AC" }}>
          <AlertCircle size={18} style={{ flexShrink:0 }}/> Todavía no hay ganadores confirmados.
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {(historial||[]).slice().sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).map(h=>(
          <div key={h.id} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:14, overflow:"hidden", display:"flex", alignItems:"center", gap:16, padding:14 }}>
            {h.foto ? (
              <div style={{ width:76, height:76, borderRadius:11, overflow:"hidden", flexShrink:0 }}>
                <img src={h.foto} alt={h.nombre} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
            ) : (
              <div style={{ width:76, height:76, borderRadius:11, background:"#0D0F12", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Trophy size={28} style={{ color:"#C6FF3D" }} />
              </div>
            )}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:17, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{h.nombre}</div>
              <div style={{ fontSize:14, color:"#C6FF3D", fontWeight:700, marginTop:4 }}>Boleto #{h.numero} · {h.premio}</div>
            </div>
            <div style={{ fontSize:12, color:"#9AA1AC", flexShrink:0, textAlign:"right" }}>{new Date(h.fecha).toLocaleDateString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric"})}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TerminosCondiciones({ siteConfig, onVolver }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
      <button onClick={onVolver} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", color:"#9AA1AC", fontSize:13, cursor:"pointer", marginBottom:20, padding:0 }}>
        ← Volver al inicio
      </button>
      <h2 style={{ fontFamily: "'Arial Black',sans-serif", fontSize: 22, marginBottom: 6 }}>TÉRMINOS Y CONDICIONES</h2>
      <p style={{ color: "#9AA1AC", fontSize: 13, marginBottom: 28 }}>Reglas claras para que compres con confianza en {siteConfig?.marca || "Hiraldo Power"}.</p>

      <div style={{ display:"flex", flexDirection:"column", gap:20, color:"#D6D9DC", fontSize:14, lineHeight:1.6 }}>
        <div>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, color:"#F2F2EF", marginBottom:8 }}>1. Cómo funcionan nuestras rifas</h3>
          <p>Cada rifa tiene un número total de boletos disponibles. Al comprar, se te asignan números al azar dentro del rango disponible de esa rifa. El sorteo se realiza en vivo una vez la rifa se cierra o llega la fecha programada.</p>
        </div>
        <div>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, color:"#F2F2EF", marginBottom:8 }}>2. Validación de pagos</h3>
          <p>Toda compra queda en estado "pendiente" hasta que verificamos el comprobante de pago enviado. Este proceso toma un máximo de 24 horas. Una vez aprobada, tus números quedan confirmados y puedes verificarlos en la sección "Verificar boleto".</p>
        </div>
        <div>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, color:"#F2F2EF", marginBottom:8 }}>3. Números Power</h3>
          <p>Algunas rifas incluyen números "premiados" que otorgan un premio en efectivo instantáneo si te toca alguno al comprar. Estos números se asignan al azar igual que cualquier otro boleto; no se pueden elegir ni predecir de antemano.</p>
        </div>
        <div>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, color:"#F2F2EF", marginBottom:8 }}>4. Entrega de premios</h3>
          <p>Una vez realizado el sorteo, nos pondremos en contacto con el ganador a través del teléfono proporcionado al momento de la compra, para coordinar la entrega del premio. Los premios en efectivo (incluyendo Números Power) se pagan directamente al ganador.</p>
        </div>
        <div>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, color:"#F2F2EF", marginBottom:8 }}>5. Rifas no completadas</h3>
          <p>Si una rifa no logra vender la cantidad mínima de boletos necesaria antes de la fecha de sorteo, el organizador podrá reprogramar la fecha o, en su defecto, reembolsar el monto pagado por los boletos ya vendidos.</p>
        </div>
        <div>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, color:"#F2F2EF", marginBottom:8 }}>6. Datos personales</h3>
          <p>El nombre y teléfono que proporcionas al comprar se usan únicamente para validar tu compra, contactarte en caso de ser ganador, y coordinar la entrega de premios. No compartimos esta información con terceros.</p>
        </div>
        <div>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, color:"#F2F2EF", marginBottom:8 }}>7. Contacto</h3>
          <p>Cualquier duda sobre estos términos, tu compra o un sorteo puedes escribirnos directamente por WhatsApp usando el botón flotante en la página.</p>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   IMAGE CROPPER — recorta en proporción 16:10
   ============================================================ */
function ImageCropper({ src, onCrop, onCancelar }) {
  const canvasRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const imgRef = useRef(null);
  const pinchRef = useRef(null); // distancia inicial del pellizco
  const ASPECT = 10 / 16;
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 5;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Escala inicial: que la imagen cubra el ancho del canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const initSc = canvas.width / img.width;
      const initOff = { x: 0, y: (canvas.height - img.height * initSc) / 2 };
      setOffset(initOff);
      setScale(initSc);
      draw(img, initOff, initSc);
    };
    img.src = src;
  }, [src]);

  const draw = (img, off, sc) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, off.x, off.y, img.width * sc, img.height * sc);
    // overlay oscuro
    const cropH = W * ASPECT;
    const cy = (H - cropH) / 2;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, cy);
    ctx.fillRect(0, cy + cropH, W, H - cy - cropH);
    // borde verde
    ctx.strokeStyle = "#C6FF3D";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, cy, W, cropH);
    // guías de tercios
    ctx.strokeStyle = "rgba(198,255,61,0.3)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(W * i / 3, cy); ctx.lineTo(W * i / 3, cy + cropH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy + cropH * i / 3); ctx.lineTo(W, cy + cropH * i / 3); ctx.stroke();
    }
  };

  const redraw = (off, sc) => { if (imgRef.current) draw(imgRef.current, off, sc); };

  // Zoom centrado en un punto (px, py) del canvas
  const applyZoom = (newSc, pivotX, pivotY, curOff, curSc) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newSc));
    const ratio = clamped / curSc;
    const newOff = {
      x: pivotX - (pivotX - curOff.x) * ratio,
      y: pivotY - (pivotY - curOff.y) * ratio,
    };
    return { sc: clamped, off: newOff };
  };

  // ── Mouse ──
  const onMouseDown = (e) => { setDrag(true); setStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); };
  const onMouseMove = (e) => {
    if (!drag) return;
    const off = { x: e.clientX - start.x, y: e.clientY - start.y };
    setOffset(off); redraw(off, scale);
  };
  const onMouseUp = () => setDrag(false);

  // ── Rueda del ratón ──
  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const pivotX = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const pivotY = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    const delta = e.deltaY < 0 ? 1.08 : 0.93;
    const { sc, off } = applyZoom(scale * delta, pivotX, pivotY, offset, scale);
    setScale(sc); setOffset(off); redraw(off, sc);
  };

  // ── Touch: arrastre + pellizco ──
  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      setDrag(true);
      setStart({ x: t.clientX - offset.x, y: t.clientY - offset.y });
      pinchRef.current = null;
    } else if (e.touches.length === 2) {
      setDrag(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = Math.hypot(dx, dy);
    }
  };
  const onTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && drag) {
      const t = e.touches[0];
      const off = { x: t.clientX - start.x, y: t.clientY - start.y };
      setOffset(off); redraw(off, scale);
    } else if (e.touches.length === 2 && pinchRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const rect = canvasRef.current.getBoundingClientRect();
      const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) * (canvasRef.current.width / rect.width);
      const midY = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) * (canvasRef.current.height / rect.height);
      const { sc, off } = applyZoom(scale * (dist / pinchRef.current), midX, midY, offset, scale);
      setScale(sc); setOffset(off); redraw(off, sc);
      pinchRef.current = dist;
    }
  };
  const onTouchEnd = () => { setDrag(false); pinchRef.current = null; };

  // ── Slider de zoom ──
  const onSlider = (val) => {
    const canvas = canvasRef.current;
    const pivotX = canvas.width / 2, pivotY = canvas.height / 2;
    const { sc, off } = applyZoom(val, pivotX, pivotY, offset, scale);
    setScale(sc); setOffset(off); redraw(off, sc);
  };

  // ── Botones +/− ──
  const zoomBtn = (factor) => {
    const canvas = canvasRef.current;
    const pivotX = canvas.width / 2, pivotY = canvas.height / 2;
    const { sc, off } = applyZoom(scale * factor, pivotX, pivotY, offset, scale);
    setScale(sc); setOffset(off); redraw(off, sc);
  };

  const handleCrop = () => {
    const canvas = canvasRef.current;
    const W = canvas.width, H = canvas.height;
    const cropH = W * ASPECT;
    const cy = (H - cropH) / 2;
    const out = document.createElement("canvas");
    out.width = W; out.height = cropH;
    out.getContext("2d").drawImage(canvas, 0, cy, W, cropH, 0, 0, W, cropH);
    onCrop(out.toDataURL("image/jpeg", 0.85));
  };

  const pct = Math.round(scale * 100);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:500, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:20 }}>
      <div style={{ fontSize:13, color:"#9AA1AC", textAlign:"center", lineHeight:1.6 }}>
        Arrastra para reposicionar · Pellizca o usa el zoom para ajustar<br/>
        <span style={{ color:"#C6FF3D", fontWeight:700 }}>El área entre las líneas verdes es lo que se verá</span>
      </div>

      <canvas ref={canvasRef} width={520} height={400}
        style={{ borderRadius:12, cursor:drag?"grabbing":"grab", touchAction:"none", maxWidth:"100%", background:"#0D0F12" }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      />

      {/* CONTROLES DE ZOOM */}
      <div style={{ display:"flex", alignItems:"center", gap:10, background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:"10px 16px", width:"100%", maxWidth:520 }}>
        <button onClick={()=>zoomBtn(0.85)} style={{ width:34, height:34, borderRadius:8, background:"#232830", border:"none", color:"#F2F2EF", fontSize:20, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>−</button>
        <input type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.01} value={scale}
          onChange={e => onSlider(Number(e.target.value))}
          style={{ flex:1, accentColor:"#C6FF3D", cursor:"pointer", height:4 }}
        />
        <button onClick={()=>zoomBtn(1.15)} style={{ width:34, height:34, borderRadius:8, background:"#232830", border:"none", color:"#F2F2EF", fontSize:20, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
        <span style={{ fontSize:12, fontWeight:700, color:"#C6FF3D", minWidth:42, textAlign:"right" }}>{pct}%</span>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={onCancelar} style={{ background:"none", border:"1px solid #232830", color:"#F2F2EF", fontWeight:700, fontSize:13, padding:"11px 22px", borderRadius:10, cursor:"pointer" }}>Cancelar</button>
        <button onClick={handleCrop} style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"11px 22px", borderRadius:10, cursor:"pointer" }}>✓ Usar esta imagen</button>
      </div>
    </div>
  );
}

/* ============================================================
   EDITOR DE RIFA — modal para crear/editar (mejorado)
   ============================================================ */
function EditorRifa({ rifa, onGuardar, onCancelar }) {
  const esNueva = !rifa;
  const [form, setForm] = useState(rifa ? { combos: [], ...rifa } : {
    id: "rifa-" + Date.now(),
    titulo: "",
    subtitulo: "",
    categoria: "motos",
    precio: 100,
    minBoletos: 1,
    totalBoletos: 1000,
    fechaSorteo: "",
    imagen: "",
    imagenes: [],
    etiqueta: "",
    etiquetaColor: "#FF6B35",
    activa: true,
    descripcion: "",
    combos: [],
  });
  const [tab, setTab] = useState("info"); // info | fotos | combos | avanzado

  const agregarCombo = () => {
    const i = (form.combos||[]).length % COLORES_COMBO.length;
    setForm(f => ({ ...f, combos: [...(f.combos||[]), { id: "combo-"+Date.now(), nombre:"", icono:"trofeo", color:COLORES_COMBO[i], cantidad: 5, precio: Math.round((f.precio||100)*5), etiqueta: "" }] }));
  };
  const cargarPlantillaCombos = () => {
    const precioBase = form.precio || 1;
    setForm(f => ({ ...f, combos: PLANTILLA_COMBOS.map(t => ({
      id: "combo-" + Date.now() + "-" + t.cantidad,
      nombre: t.nombre, icono: t.icono, color: t.color, etiqueta: t.etiqueta,
      cantidad: t.cantidad, precio: Math.round(t.cantidad * precioBase),
    })) }));
  };
  const actualizarCombo = (id, key, val) => {
    setForm(f => ({ ...f, combos: (f.combos||[]).map(c => c.id===id ? { ...c, [key]: val } : c) }));
  };
  const eliminarCombo = (id) => {
    setForm(f => ({ ...f, combos: (f.combos||[]).filter(c => c.id!==id) }));
  };
  const [linkFoto, setLinkFoto] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fileRef = useRef();
  const fileMultiRef = useRef();
  const [cropSrc, setCropSrc] = useState(null);

  const comprimirImagen = (dataUrl, maxPx, quality, cb) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  };

  const onImagen = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
  };

  const onCropDone = (croppedDataUrl) => {
    comprimirImagen(croppedDataUrl, 1200, 0.82, (compressed) => {
      set("imagen", compressed);
      setCropSrc(null);
    });
  };

  const onImagenExtra = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => comprimirImagen(ev.target.result, 800, 0.7, (compressed) => {
        setForm(f => ({ ...f, imagenes: [...(f.imagenes||[]), compressed] }));
      });
      reader.readAsDataURL(file);
    });
  };

  const agregarLinkFoto = () => {
    if (!linkFoto.trim()) return;
    if (!form.imagen) { set("imagen", linkFoto.trim()); }
    else { setForm(f => ({ ...f, imagenes: [...(f.imagenes||[]), linkFoto.trim()] })); }
    setLinkFoto("");
  };

  const eliminarImagenExtra = (idx) => {
    setForm(f => ({ ...f, imagenes: f.imagenes.filter((_,i)=>i!==idx) }));
  };

  const inp = (label, key, type="text", placeholder="") => (
    <label style={{ display:"block", marginBottom:14 }}>
      <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>{label}</span>
      <input type={type} value={form[key]||""} onChange={e=>set(key, type==="number"?Number(e.target.value):e.target.value)}
        placeholder={placeholder}
        style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none", boxSizing:"border-box" }} />
    </label>
  );

  const TAB_BTN = ({id, label}) => (
    <button onClick={()=>setTab(id)} style={{ flex:1, background:tab===id?"#C6FF3D":"#0D0F12", color:tab===id?"#0D0F12":"#9AA1AC", border:`1px solid ${tab===id?"#C6FF3D":"#232830"}`, fontWeight:700, fontSize:12, padding:"9px 0", borderRadius:8, cursor:"pointer" }}>{label}</button>
  );

  const valido = form.titulo && form.fechaSorteo;

  return (
    <>
    {cropSrc && <ImageCropper src={cropSrc} onCrop={onCropDone} onCancelar={()=>setCropSrc(null)} />}
    <div onClick={onCancelar} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:"16px" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:18, width:"100%", maxWidth:600, maxHeight:"92vh", overflowY:"auto", position:"relative", display:"flex", flexDirection:"column" }}>

        {/* HEADER */}
        <div style={{ padding:"20px 22px 0", position:"sticky", top:0, background:"#14171C", zIndex:10, borderBottom:"1px solid #232830", paddingBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:17 }}>{esNueva?"NUEVA RIFA":"EDITAR RIFA"}</h3>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button onClick={()=>setShowPreview(v=>!v)} style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"none", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"8px 14px", borderRadius:9, cursor:"pointer" }}>
                {showPreview ? <><X size={13}/> Ocultar vista previa</> : <><Trophy size={13}/> Vista previa</>}
              </button>
              <button onClick={onCancelar} style={{ background:"#232830", border:"none", color:"#F2F2EF", width:30, height:30, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><X size={16}/></button>
            </div>
          </div>
          {/* TABS */}
          <div style={{ display:"flex", gap:8 }}>
            <TAB_BTN id="info" label="📝 Información" />
            <TAB_BTN id="fotos" label="🖼️ Fotos" />
            <TAB_BTN id="combos" label="🎟️ Combos" />
            <TAB_BTN id="avanzado" label="⚙️ Avanzado" />
          </div>
        </div>

        {/* CONTENIDO */}
        <div style={{ padding:"20px 22px", flex:1 }}>

          {/* VISTA PREVIA */}
          {showPreview && (
            <div style={{ marginBottom:22 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#9AA1AC", letterSpacing:"0.6px", marginBottom:10 }}>VISTA PREVIA</div>
              <div style={{ background:"#0D0F12", borderRadius:12, overflow:"hidden", border:"1px solid #232830" }}>
                <div style={{ height:140, background:"#1a1d23", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
                  {form.imagen
                    ? <img src={form.imagen} alt={form.titulo} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    : <Trophy size={36} style={{ opacity:0.1, color:"#9AA1AC" }} />
                  }
                  {form.etiqueta && (
                    <span style={{ position:"absolute", top:8, left:8, background:form.etiquetaColor||"#FF6B35", fontSize:9, fontWeight:800, padding:"2px 8px", borderRadius:999, color:"#fff" }}>{form.etiqueta}</span>
                  )}
                </div>
                <div style={{ padding:"12px 14px" }}>
                  <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, marginBottom:4 }}>{form.titulo||<span style={{color:"#9AA1AC"}}>Sin título</span>}</div>
                  {form.subtitulo && <div style={{ fontSize:11, color:"#9AA1AC", marginBottom:6 }}>{form.subtitulo}</div>}
                  {form.fechaSorteo && <div style={{ fontSize:11, color:"#22c55e", fontWeight:700, marginBottom:6 }}>📅 Sorteo: {new Date(form.fechaSorteo).toLocaleDateString("es-DO")}</div>}
                  {form.descripcion && <div style={{ fontSize:12, color:"#9AA1AC", lineHeight:1.5, marginBottom:8 }}>{form.descripcion}</div>}
                  <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:18, color:"#C6FF3D" }}>{fmtMoney(form.precio||0)}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: INFORMACIÓN */}
          {tab==="info" && (
            <div>
              {inp("TÍTULO *", "titulo", "text", "Ej: Scooter Eléctrica")}
              {inp("SUBTÍTULO", "subtitulo", "text", "Ej: Yamaha E-Vino 2024 · Sorteo julio 2026")}

              {/* DESCRIPCIÓN — textarea */}
              <label style={{ display:"block", marginBottom:14 }}>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>DESCRIPCIÓN</span>
                <textarea value={form.descripcion||""} onChange={e=>set("descripcion",e.target.value)}
                  placeholder="Describe el premio con todos los detalles: modelo, color, año, condición, lugar de entrega, etc."
                  rows={5}
                  style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none", resize:"vertical", lineHeight:1.6, fontFamily:"inherit", boxSizing:"border-box" }} />
                <span style={{ fontSize:11, color:"#9AA1AC", marginTop:4, display:"block" }}>{(form.descripcion||"").length} caracteres</span>
              </label>

              <label style={{ display:"block", marginBottom:14 }}>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>CATEGORÍA</span>
                <select value={form.categoria} onChange={e=>set("categoria",e.target.value)}
                  style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }}>
                  {CATEGORIAS.map(c=><option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
              </label>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                {inp("FECHA DEL SORTEO *", "fechaSorteo", "date")}
                <label style={{ display:"block" }}>
                  <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>HORA DEL SORTEO *</span>
                  <input type="time" value={form.horaSorteo||"20:00"} onChange={e=>set("horaSorteo",e.target.value)}
                    style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
                </label>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
                <label style={{ display:"block" }}>
                  <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>PRECIO (RD$)</span>
                  <input type="number" value={form.precio} onChange={e=>set("precio",Number(e.target.value))} min={1}
                    style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
                </label>
                <label style={{ display:"block" }}>
                  <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>MÍN. BOLETOS</span>
                  <input type="number" value={form.minBoletos} onChange={e=>set("minBoletos",Number(e.target.value))} min={1}
                    style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
                </label>
                <label style={{ display:"block" }}>
                  <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>TOTAL BOLETOS</span>
                  <input type="number" value={form.totalBoletos} onChange={e=>set("totalBoletos",Number(e.target.value))} min={1}
                    style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
                </label>
              </div>
            </div>
          )}

          {/* TAB: FOTOS */}
          {tab==="fotos" && (
            <div>
              {/* Foto principal */}
              <div style={{ marginBottom:22 }}>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:10 }}>FOTO PRINCIPAL</span>
                <div style={{ width:"100%", height:180, borderRadius:12, background:"#0D0F12", border:`2px dashed ${form.imagen?"#C6FF3D":"#232830"}`, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", marginBottom:12, cursor:"pointer" }}
                  onClick={()=>fileRef.current.click()}>
                  {form.imagen
                    ? <img src={form.imagen} alt="principal" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    : <div style={{ textAlign:"center", color:"#9AA1AC" }}>
                        <ImagePlus size={32} style={{ marginBottom:8, opacity:0.4 }} />
                        <div style={{ fontSize:13, fontWeight:700 }}>Haz clic para subir foto</div>
                        <div style={{ fontSize:11, marginTop:4, opacity:0.7 }}>JPG, PNG, WEBP</div>
                      </div>
                  }
                  {form.imagen && (
                    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0)", display:"flex", alignItems:"center", justifyContent:"center", opacity:0, transition:"opacity .2s" }}
                      onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>
                      <div style={{ background:"rgba(0,0,0,0.7)", borderRadius:10, padding:"8px 14px", color:"#F2F2EF", fontSize:13, fontWeight:700 }}>Cambiar foto</div>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={onImagen} style={{ display:"none" }} />
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>fileRef.current.click()} style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"none", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:9, cursor:"pointer" }}>
                    <ImagePlus size={14}/> {form.imagen?"Cambiar":"Subir foto"}
                  </button>
                  {form.imagen && (
                    <button onClick={()=>set("imagen","")} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"1px solid rgba(255,84,112,0.3)", color:"#FF5470", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:9, cursor:"pointer" }}>
                      <Trash2 size={13}/> Quitar
                    </button>
                  )}
                </div>
              </div>

              {/* Link de foto */}
              <div style={{ marginBottom:22 }}>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:8 }}>O PEGA UN LINK DE IMAGEN</span>
                <div style={{ display:"flex", gap:8 }}>
                  <input value={linkFoto} onChange={e=>setLinkFoto(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&agregarLinkFoto()}
                    placeholder="https://ejemplo.com/foto.jpg"
                    style={{ flex:1, background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"10px 12px", borderRadius:9, fontSize:13, outline:"none" }} />
                  <button onClick={agregarLinkFoto} style={{ background:"#232830", border:"none", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"10px 16px", borderRadius:9, cursor:"pointer", whiteSpace:"nowrap" }}>+ Agregar</button>
                </div>
                <div style={{ fontSize:11, color:"#9AA1AC", marginTop:6 }}>Si no hay foto principal, este link se usa como principal. Si ya hay, se agrega a la galería.</div>
              </div>

              {/* Galería de fotos adicionales */}
              <div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"#9AA1AC" }}>FOTOS ADICIONALES ({(form.imagenes||[]).length})</span>
                  <button onClick={()=>fileMultiRef.current.click()} style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"none", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"8px 12px", borderRadius:9, cursor:"pointer" }}>
                    <Plus size={13}/> Subir más
                  </button>
                </div>
                <input ref={fileMultiRef} type="file" accept="image/*" multiple onChange={onImagenExtra} style={{ display:"none" }} />
                {(form.imagenes||[]).length===0 && (
                  <div style={{ background:"#0D0F12", border:"1px dashed #232830", borderRadius:10, padding:16, textAlign:"center", color:"#9AA1AC", fontSize:13 }}>
                    Sin fotos adicionales
                  </div>
                )}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {(form.imagenes||[]).map((img,i)=>(
                    <div key={i} style={{ position:"relative", paddingTop:"75%", borderRadius:8, overflow:"hidden", background:"#0D0F12" }}>
                      <img src={img} alt={`extra-${i}`} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                      <button onClick={()=>eliminarImagenExtra(i)} style={{ position:"absolute", top:4, right:4, background:"rgba(0,0,0,0.7)", border:"none", color:"#FF5470", width:22, height:22, borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <X size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: COMBOS */}
          {tab==="combos" && (
            <div>
              <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:16 }}>
                Crea niveles de paquetes de boletos (ej: AMATEUR, PRO, ELITE...) con ícono, color y precio propio. Se muestran como tarjetas en la pantalla de compra, además de la opción de cantidad libre.
              </p>

              <button onClick={cargarPlantillaCombos} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(198,255,61,0.08)", border:"1px solid rgba(198,255,61,0.3)", color:"#C6FF3D", fontSize:12, fontWeight:700, padding:"10px 14px", borderRadius:9, cursor:"pointer", marginBottom:16 }}>
                <Sparkles size={14}/> Cargar plantilla de 6 niveles (AMATEUR → MÍTICO)
              </button>
              {(form.combos||[]).length>0 && (
                <p style={{ color:"#5a6170", fontSize:11, marginTop:-10, marginBottom:16 }}>Usar la plantilla reemplaza los combos actuales de esta rifa.</p>
              )}

              {(form.combos||[]).length===0 && (
                <div style={{ background:"#0D0F12", border:"1px dashed #232830", borderRadius:10, padding:"18px 16px", textAlign:"center", color:"#9AA1AC", fontSize:13, marginBottom:16 }}>
                  Todavía no hay combos para esta rifa. Solo se venderá con cantidad libre a {fmtMoney(form.precio||0)} por boleto.
                </div>
              )}

              {(form.combos||[]).map((combo) => {
                const precioNormal = (form.precio||0) * (combo.cantidad||0);
                const ahorro = precioNormal>0 ? Math.round((1 - (combo.precio||0)/precioNormal)*100) : 0;
                const IconoSel = ICONOS_COMBO[combo.icono] || Trophy;
                return (
                  <div key={combo.id} style={{ background:"#0D0F12", border:"1px solid #232830", borderRadius:10, padding:14, marginBottom:12 }}>
                    <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12 }}>
                      <div style={{ width:36, height:36, borderRadius:9, background:`${combo.color||"#C6FF3D"}22`, border:`1px solid ${combo.color||"#C6FF3D"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <IconoSel size={17} style={{ color: combo.color||"#C6FF3D" }}/>
                      </div>
                      <label style={{ display:"block", flex:1 }}>
                        <span style={{ display:"block", fontSize:11, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>NOMBRE DEL NIVEL</span>
                        <input value={combo.nombre||""} placeholder="Ej: AMATEUR"
                          onChange={e=>actualizarCombo(combo.id,"nombre",e.target.value)}
                          style={{ width:"100%", background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", padding:"9px 12px", borderRadius:9, fontSize:14, outline:"none", boxSizing:"border-box" }} />
                      </label>
                      <button onClick={()=>eliminarCombo(combo.id)} title="Eliminar combo"
                        style={{ background:"none", border:"1px solid rgba(255,84,112,0.3)", color:"#FF5470", width:36, height:36, borderRadius:9, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, alignSelf:"flex-end" }}>
                        <Trash2 size={15}/>
                      </button>
                    </div>

                    <div style={{ marginBottom:12 }}>
                      <span style={{ display:"block", fontSize:11, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>ÍCONO</span>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {Object.entries(ICONOS_COMBO).map(([key,Icon])=>(
                          <button key={key} onClick={()=>actualizarCombo(combo.id,"icono",key)}
                            style={{ width:32, height:32, borderRadius:8, background: combo.icono===key?`${combo.color||"#C6FF3D"}22`:"#14171C", border:`1px solid ${combo.icono===key?(combo.color||"#C6FF3D"):"#232830"}`, color: combo.icono===key?(combo.color||"#C6FF3D"):"#9AA1AC", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <Icon size={14}/>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginBottom:12 }}>
                      <span style={{ display:"block", fontSize:11, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>COLOR</span>
                      <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                        {COLORES_COMBO.map(c=>(
                          <button key={c} onClick={()=>actualizarCombo(combo.id,"color",c)}
                            style={{ width:26, height:26, borderRadius:"50%", background:c, border: combo.color===c?"2px solid #F2F2EF":"2px solid transparent", cursor:"pointer" }} />
                        ))}
                        <input type="color" value={combo.color||"#C6FF3D"} onChange={e=>actualizarCombo(combo.id,"color",e.target.value)}
                          style={{ width:26, height:26, padding:0, border:"1px solid #232830", borderRadius:"50%", background:"none", cursor:"pointer" }} />
                      </div>
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                      <label style={{ display:"block" }}>
                        <span style={{ display:"block", fontSize:11, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>CANTIDAD DE BOLETOS</span>
                        <input type="number" min={1} value={combo.cantidad}
                          onChange={e=>actualizarCombo(combo.id,"cantidad",Number(e.target.value))}
                          style={{ width:"100%", background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", padding:"10px 12px", borderRadius:9, fontSize:14, outline:"none", boxSizing:"border-box" }} />
                      </label>
                      <label style={{ display:"block" }}>
                        <span style={{ display:"block", fontSize:11, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>PRECIO DEL COMBO (RD$)</span>
                        <input type="number" min={1} value={combo.precio}
                          onChange={e=>actualizarCombo(combo.id,"precio",Number(e.target.value))}
                          style={{ width:"100%", background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", padding:"10px 12px", borderRadius:9, fontSize:14, outline:"none", boxSizing:"border-box" }} />
                      </label>
                      <label style={{ display:"block" }}>
                        <span style={{ display:"block", fontSize:11, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>ETIQUETA (opcional)</span>
                        <input value={combo.etiqueta||""} placeholder="Ej: POPULAR, VIP"
                          onChange={e=>actualizarCombo(combo.id,"etiqueta",e.target.value)}
                          style={{ width:"100%", background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", padding:"10px 12px", borderRadius:9, fontSize:14, outline:"none", boxSizing:"border-box" }} />
                      </label>
                    </div>
                    <div style={{ fontSize:11, color: ahorro>0?"#22c55e":"#9AA1AC", marginTop:10 }}>
                      {fmtMoney(combo.cantidad? Math.round((combo.precio||0)/combo.cantidad) : 0)} por boleto
                      {ahorro>0 && ` · ahorra ${ahorro}% vs. precio normal (${fmtMoney(precioNormal)})`}
                      {ahorro<=0 && combo.precio>=precioNormal && precioNormal>0 && ` · sin descuento vs. precio normal (${fmtMoney(precioNormal)})`}
                    </div>
                  </div>
                );
              })}

              <button onClick={agregarCombo} style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"none", color:"#F2F2EF", fontSize:13, fontWeight:700, padding:"11px 16px", borderRadius:9, cursor:"pointer" }}>
                <Plus size={15}/> Agregar combo
              </button>
            </div>
          )}

          {/* TAB: AVANZADO */}
          {tab==="avanzado" && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, marginBottom:14 }}>
                <label style={{ display:"block" }}>
                  <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>ETIQUETA (badge opcional)</span>
                  <input value={form.etiqueta||""} onChange={e=>set("etiqueta",e.target.value)} placeholder="Ej: 🔥 POPULAR · 🆕 NUEVO"
                    style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
                </label>
                <label style={{ display:"block" }}>
                  <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>COLOR</span>
                  <input type="color" value={form.etiquetaColor||"#FF6B35"} onChange={e=>set("etiquetaColor",e.target.value)}
                    style={{ width:52, height:44, borderRadius:9, border:"1px solid #232830", background:"#0D0F12", cursor:"pointer", padding:4 }} />
                </label>
              </div>
              {form.etiqueta && (
                <div style={{ marginBottom:18 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:"#9AA1AC" }}>Vista previa del badge:</span>
                  <span style={{ display:"inline-block", marginLeft:10, background:form.etiquetaColor||"#FF6B35", fontSize:11, fontWeight:800, padding:"3px 10px", borderRadius:999, color:"#fff" }}>{form.etiqueta}</span>
                </div>
              )}

              <div style={{ height:1, background:"#232830", margin:"20px 0" }} />

              <label style={{ display:"flex", gap:12, alignItems:"center", marginBottom:22, cursor:"pointer" }}>
                <div onClick={()=>set("activa",!form.activa)} style={{ width:48, height:26, borderRadius:999, background:form.activa?"#C6FF3D":"#232830", position:"relative", transition:"background .2s", cursor:"pointer", flexShrink:0 }}>
                  <div style={{ position:"absolute", top:3, left:form.activa?24:3, width:20, height:20, borderRadius:999, background:form.activa?"#0D0F12":"#9AA1AC", transition:"left .2s" }} />
                </div>
                <div>
                  <span style={{ fontSize:13, fontWeight:700, color:form.activa?"#C6FF3D":"#9AA1AC", display:"block" }}>{form.activa?"RIFA ACTIVA":"RIFA INACTIVA"}</span>
                  <span style={{ fontSize:11, color:"#9AA1AC" }}>{form.activa?"Visible en el catálogo público":"Oculta del catálogo"}</span>
                </div>
              </label>

              <div style={{ background:"#0D0F12", border:"1px solid #232830", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:8 }}>ID DE RIFA</div>
                <code style={{ fontSize:12, color:"#818cf8" }}>{form.id}</code>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER STICKY */}
        <div style={{ padding:"16px 22px", borderTop:"1px solid #232830", background:"#14171C", position:"sticky", bottom:0, display:"flex", gap:10 }}>
          <button onClick={onCancelar} style={{ flex:1, background:"none", border:"1px solid #232830", color:"#F2F2EF", fontWeight:700, fontSize:13, padding:"12px 0", borderRadius:10, cursor:"pointer" }}>Cancelar</button>
          <button onClick={()=>onGuardar(form)} disabled={!valido}
            style={{ flex:2, background:valido?"#C6FF3D":"#232830", color:valido?"#0D0F12":"#9AA1AC", border:"none", fontWeight:800, fontSize:13, padding:"12px 0", borderRadius:10, cursor:valido?"pointer":"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Check size={15}/> {esNueva?"Crear rifa":"Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  </>
  );
}

/* ============================================================
   APP PRINCIPAL
   ============================================================ */
export default function App() {
  const [view, setView] = useState("catalogo");
  const [rifaActiva, setRifaActiva] = useState(null);
  const [ready, setReady] = useState(false);
  const [boletos, setBoletos] = useState({});
  const [pendientes, setPendientes] = useState([]);
  const [ganador, setGanador] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [rifas, setRifas] = useState(RIFAS_INICIALES);
  const [metodosPago, setMetodosPago] = useState(METODOS_PAGO_INICIALES);
  const [siteConfig, setSiteConfig] = useState(SITE_CONFIG_INICIAL);
  const [powerNumbers, setPowerNumbers] = useState(POWER_NUMBERS_INICIAL);
  const [premiosPower, setPremiosPower] = useState([]);
  const [gastosRifas, setGastosRifas] = useState({});
  const [toast, setToast] = useState(null);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  // Actualiza el título de la pestaña del navegador (en vez del nombre del
  // dominio) según el nombre de marca configurado en "Editar página".
  useEffect(() => {
    document.title = siteConfig.marca || "HIRALDO POWER";
  }, [siteConfig.marca]);

  useEffect(() => {
    (async () => {
      const load = async (key, def) => { return await dbGet(key, def); };
      const r = await load("rifas", RIFAS_INICIALES);
      const b = await cargarTodosLosBoletos(r);
      const p = await load("pending", []);
      const g = await load("ganador", null);
      const h = await load("historial", []);
      const mp = await load("metodosPago", METODOS_PAGO_INICIALES);
      const sc = await load("siteConfig", SITE_CONFIG_INICIAL);
      const pn = await load("powerNumbers", POWER_NUMBERS_INICIAL);
      const pp = await load("premiosPower", []);
      const gr = await load("gastosRifas", {});
      setBoletos(b); setPendientes(p); setGanador(g); setHistorial(h); setRifas(r); setMetodosPago(mp); setSiteConfig({...SITE_CONFIG_INICIAL, ...sc});
      setPowerNumbers(pn); setPremiosPower(pp); setGastosRifas(gr);
      setReady(true);
    })();
  }, []);

  const save = async (key, val, setter) => { setter(val); const ok = await dbSet(key, val); return ok; };
  const showToast = (msg, kind="ok") => { setToast({msg,kind}); setTimeout(()=>setToast(null), kind==="power"?6500:3200); };

  // Guarda solo las rifas cuyo pool de boletos cambió (cada una en su propio
  // documento de Firebase), y elimina el documento de las rifas que ya no existen.
  const saveBoletos = async (nextBoletos) => {
    const prevBoletos = boletos;
    setBoletos(nextBoletos);
    try {
      const idsPrev = Object.keys(prevBoletos);
      const idsNext = Object.keys(nextBoletos);
      const cambiados = idsNext.filter(id => prevBoletos[id] !== nextBoletos[id]);
      const eliminados = idsPrev.filter(id => !(id in nextBoletos));
      let ok = true;
      for (const id of cambiados) {
        const r = await guardarPoolBoletos(id, nextBoletos[id]);
        if (!r) ok = false;
      }
      for (const id of eliminados) {
        try { await deleteDoc(doc(db, "hiraldopower", "tickets_" + id)); } catch {}
      }
      return ok;
    } catch (e) {
      console.error("saveBoletos error:", e);
      return false;
    }
  };

  // Agrega una nueva compra pendiente de forma segura: lee el dato más
  // reciente de Firebase justo antes de guardar (en vez de usar el estado
  // local, que puede estar desactualizado), para no pisar aprobaciones que
  // el admin esté haciendo al mismo tiempo en otra pestaña o dispositivo.
  const agregarPendiente = async (nuevaCompra) => {
    const pendRef = doc(db, "hiraldopower", "pending");
    let nextPendFinal = null;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(pendRef);
        const pendActual = snap.exists() ? (snap.data().value || []) : [];
        nextPendFinal = [...pendActual, nuevaCompra];
        tx.set(pendRef, { value: nextPendFinal });
      });
    } catch (e) {
      console.error("agregarPendiente error:", e);
      return false;
    }
    setPendientes(nextPendFinal);
    return true;
  };

  const vendidosPorRifa = (rifaId) => Object.values(boletos[rifaId]||{}).filter(Boolean).length;
  const pctGlobal = (() => {
    const activas = rifas.filter(r=>r.activa);
    const totalBoletosActivas = activas.reduce((s,r)=>s+r.totalBoletos,0);
    const totalVendidosActivas = activas.reduce((s,r)=>s+vendidosPorRifa(r.id),0);
    return totalBoletosActivas>0 ? Math.round((totalVendidosActivas/totalBoletosActivas)*100) : 0;
  })();

  const refreshFromFirebase = async () => {
    try {
      const p = await dbGet("pending", []);
      const r = await dbGet("rifas", RIFAS_INICIALES);
      const b = await cargarTodosLosBoletos(r);
      const h = await dbGet("historial", []);
      const sc = await dbGet("siteConfig", SITE_CONFIG_INICIAL);
      const pn = await dbGet("powerNumbers", POWER_NUMBERS_INICIAL);
      const pp = await dbGet("premiosPower", []);
      const gr = await dbGet("gastosRifas", {});
      setPendientes(p);
      setBoletos(b);
      setHistorial(h);
      setRifas(r);
      setSiteConfig({...SITE_CONFIG_INICIAL, ...sc});
      setPowerNumbers(pn);
      setPremiosPower(pp);
      setGastosRifas(gr);
    } catch {}
  };

  const irARifa = (rifa) => { setRifaActiva(rifa); setView("rifa"); };

  useEffect(() => {
    const check = () => { if (window.location.hash === "#admin9810") setView("admin"); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  /* ---- Notificaciones de nuevas compras pendientes (con sonido) ---- */
  const [notifPermiso, setNotifPermiso] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  // Registra el service worker (necesario para que Chrome en Android pueda
  // mostrar notificaciones de verdad, no solo el sonido/vibración).
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(()=>{});
    }
  }, []);

  const mostrarNotificacion = async (titulo, opciones) => {
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(titulo, opciones);
        return;
      } catch {}
    }
    try { new Notification(titulo, opciones); } catch {}
  };
  const idsPendientesVistosRef = useRef(null);

  const pedirPermisoNotificaciones = async () => {
    if (typeof Notification === "undefined") { showToast("Tu navegador no soporta notificaciones.", "warn"); return; }
    try {
      const permiso = await Notification.requestPermission();
      setNotifPermiso(permiso);
      if (permiso === "granted") showToast("Notificaciones activadas ✓", "ok");
      else showToast("No se activaron las notificaciones.", "warn");
    } catch {
      showToast("No se pudo pedir permiso de notificaciones.", "warn");
    }
  };

  const sonarAviso = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch {}
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  };

  /* ---- Auto-refresh pendientes cuando el admin está abierto ---- */
  useEffect(() => {
    if (view !== "admin") return;
    const intervalo = setInterval(async () => {
      try {
        const p = await dbGet("pending", []);
        // La primera vez que corre (tras entrar al admin), solo recordamos
        // cuáles compras ya existían — no queremos notificar por compras viejas.
        if (idsPendientesVistosRef.current === null) {
          idsPendientesVistosRef.current = new Set(p.map(x => x.id));
        } else {
          const nuevas = p.filter(x => x.estado === "pendiente" && !idsPendientesVistosRef.current.has(x.id));
          if (nuevas.length > 0 && notifPermiso === "granted") {
            sonarAviso();
            nuevas.forEach(n => {
              mostrarNotificacion("¡Nueva compra en Hiraldo Power! 🎟️", {
                body: `${n.nombre} · ${n.cantidad} boleto${n.cantidad>1?"s":""} · ${fmtMoney(n.total)}`,
                tag: "compra-" + n.id,
                requireInteraction: true,
              });
            });
          }
          idsPendientesVistosRef.current = new Set(p.map(x => x.id));
        }
        setPendientes(p);
        const b = await cargarTodosLosBoletos(rifas);
        setBoletos(b);
      } catch {}
    }, 20000); // cada 20 segundos
    return () => clearInterval(intervalo);
  }, [view, rifas, notifPermiso]);

  if (!ready) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#0D0F12", color:"#C6FF3D", gap:12, fontFamily:"'Arial Black',sans-serif", letterSpacing:1 }}>
      <Zap size={40} style={{ animation:"pulse 1.2s ease-in-out infinite" }} />
      CARGANDO SISTEMA…
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );

  return (
    <div style={{ background:"#0D0F12", color:"#F2F2EF", minHeight:"100vh", width:"100%", fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body,#root{width:100%;min-height:100vh;background:#0D0F12;}
        body{margin:0;padding:0;background:#0D0F12;}
        @keyframes slidein{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes pulse{0%,100%{box-shadow:0 8px 24px rgba(245,158,11,0.35)}50%{box-shadow:0 8px 34px rgba(245,158,11,0.7)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes fadein{from{opacity:0}to{opacity:1}}
        @keyframes slidein-drawer{from{transform:translateX(100%)}to{transform:translateX(0)}}
        button,input,select,textarea{font-family:inherit;}
        .nb{background:none;border:none;color:#9AA1AC;font-weight:600;font-size:14px;padding:10px 14px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:5px;transition:color .15s;}
        .nb:hover{color:#F2F2EF;}
        .nb.on{color:#0D0F12;background:#C6FF3D;}
        @media(max-width:768px){
          .nb{font-size:12px;padding:8px 10px;}
          .catalog-section{padding:32px 16px !important;}
          .hero-section{padding:56px 16px 40px !important;}
          .header-inner{padding:12px 16px !important;}
          .how-section{padding:40px 16px !important;}
          .admin-layout{flex-direction:column !important;}
          .admin-sidebar{flex-direction:row !important;flex-wrap:wrap;border-right:none !important;border-bottom:1px solid #232830;padding:12px 16px !important;gap:6px !important;width:auto !important;min-width:unset !important;}
          .admin-sidebar button{padding:8px 12px !important;font-size:11px !important;}
          .admin-content{padding:20px 16px !important;}
          .admin-main{padding:24px 16px !important;}
        }
        @media(max-width:640px){
          .nav-desktop{display:none !important;}
          .nav-hamburguesa{display:flex !important;}
          .header-inner{justify-content:space-between !important;}
          .buy-inline{display:none !important;}
          .buy-bar{
            display:flex !important; align-items:center; justify-content:space-between;
            position:fixed; left:0; right:0; bottom:0; z-index:100;
            background:rgba(13,15,18,0.97); backdrop-filter:blur(8px);
            border-top:1px solid #232830; padding:14px 20px calc(14px + env(safe-area-inset-bottom));
          }
          .buy-bar-spacer{display:block !important; height:88px;}
          .whatsapp-fab.with-buybar{bottom:100px !important;}
        }
      `}</style>

      {toast && (
        <div style={{ position:"fixed", top:18, right:18, zIndex:300, background:"#14171C", border:`1px solid ${toast.kind==="warn"?"#FF6B35":toast.kind==="power"?"#f59e0b":"#C6FF3D"}`, color:"#F2F2EF", padding:"12px 18px", borderRadius:10, fontSize:13, maxWidth:320, fontWeight: toast.kind==="power"?700:400, animation: toast.kind==="power" ? "slidein .25s ease, pulse 1s ease 2" : "slidein .25s ease", boxShadow: toast.kind==="power" ? "0 8px 24px rgba(245,158,11,0.35)" : "0 8px 24px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <header style={{ position:"sticky", top:0, zIndex:40, background:"rgba(13,15,18,0.92)", backdropFilter:"blur(8px)", borderBottom:"1px solid #232830" }}>
        <div className="header-inner" style={{ maxWidth:1600, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 60px", flexWrap:"wrap", gap:8 }}>
          <button onClick={()=>setView("catalogo")} style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", color:"#F2F2EF", fontFamily:"'Arial Black',sans-serif", fontSize:14, letterSpacing:"0.5px", cursor:"pointer" }}>
            {siteConfig.logoUrl
              ? <img src={siteConfig.logoUrl} alt="" style={{ height:34, width:"auto" }} />
              : <Zap size={22} style={{ color: siteConfig.colorAcento }}/>}
            {siteConfig.marca}
          </button>
          <nav className="nav-desktop" style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            <button className={`nb${view==="catalogo"||view==="rifa"?" on":""}`} onClick={()=>setView("catalogo")}>Rifas</button>
            <button className={`nb${view==="ganadores"?" on":""}`} onClick={()=>setView("ganadores")}><Trophy size={13}/> Ganadores</button>
            <button className={`nb${view==="verify"?" on":""}`} onClick={()=>setView("verify")}><ShieldCheck size={13}/> Verificar boleto</button>
          </nav>
          <button className="nav-hamburguesa" onClick={()=>setMenuMovilAbierto(v=>!v)}
            style={{ display:"none", background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", width:40, height:40, borderRadius:9, cursor:"pointer", alignItems:"center", justifyContent:"center" }}>
            {menuMovilAbierto ? <X size={18}/> : <Menu size={18}/>}
          </button>
        </div>
        <div style={{ height:3, background:"#232830" }}>
          <div style={{ height:"100%", width:`${pctGlobal}%`, background: siteConfig.colorAcento, transition:"width .4s" }} />
        </div>
      </header>

      {/* MENÚ LATERAL MÓVIL (drawer) */}
      {menuMovilAbierto && (
        <div style={{ position:"fixed", inset:0, zIndex:250 }}>
          <div onClick={()=>setMenuMovilAbierto(false)} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.6)", animation:"fadein .2s ease" }} />
          <div style={{ position:"absolute", top:0, right:0, bottom:0, width:"78%", maxWidth:320, background:"#0D0F12", borderLeft:"1px solid #232830", boxShadow:"-8px 0 30px rgba(0,0,0,0.5)", animation:"slidein-drawer .22s ease", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"22px 24px", borderBottom:"1px solid #232830", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontFamily:"'Arial Black',sans-serif", fontSize:18, letterSpacing:"1px", color: siteConfig.colorAcento }}>MENÚ</span>
              <button onClick={()=>setMenuMovilAbierto(false)} style={{ background:"none", border:"none", color:"#9AA1AC", cursor:"pointer", padding:6 }}>
                <X size={20}/>
              </button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", padding:"10px 8px" }}>
              {[
                { id:"catalogo", label:"Inicio", icon:Home, activo: view==="catalogo"||view==="rifa" },
                { id:"ganadores", label:"Ganadores", icon:Trophy, activo: view==="ganadores" },
                { id:"verify", label:"Verificar boleto", icon:ShieldCheck, activo: view==="verify" },
              ].map(({id,label,icon:Icon,activo})=>(
                <button key={id} onClick={()=>{setView(id);setMenuMovilAbierto(false);}}
                  style={{ display:"flex", alignItems:"center", gap:16, background:"none", border:"none", color: activo?siteConfig.colorAcento:"#F2F2EF", fontSize:16, fontWeight:700, letterSpacing:"0.5px", padding:"16px 16px", cursor:"pointer", textAlign:"left", borderRadius:10 }}>
                  <Icon size={20} style={{ color: activo?siteConfig.colorAcento:"#9AA1AC" }}/> {label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CATÁLOGO */}
      {view==="catalogo" && (
        <div>
          <section className="hero-section" style={{ padding:"100px 60px 80px", borderBottom:"1px solid #232830", position:"relative", overflow:"hidden", minHeight:320, display:"flex", alignItems:"center" }}>
            <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(#232830 1px,transparent 1px),linear-gradient(90deg,#232830 1px,transparent 1px)", backgroundSize:"40px 40px", opacity:0.2 }} />
            {/* Glow de fondo */}
            <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:600, height:300, background:"radial-gradient(ellipse,rgba(198,255,61,0.06) 0%,transparent 70%)", pointerEvents:"none" }} />
            <div style={{ position:"relative", width:"100%", textAlign:"center" }}>
              <div style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, fontWeight:800, letterSpacing:"1.5px", color:"#FF6B35", background:"rgba(255,107,53,0.1)", border:"1px solid rgba(255,107,53,0.3)", padding:"7px 16px", borderRadius:999, marginBottom:28 }}>
                <Zap size={12}/> {siteConfig.badgeHero}
              </div>
              <h1 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:"clamp(48px,6vw,88px)", lineHeight:1.05, marginBottom:20, letterSpacing:"-0.5px", color: siteConfig.colorTitulo1 || "#F2F2EF" }}>
                {siteConfig.tituloHero1}<br/><span style={{ background:"linear-gradient(90deg,#818cf8,#ec4899)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{siteConfig.tituloHero2}</span>
              </h1>
              <p style={{ color:"#9AA1AC", fontSize:16, maxWidth:560, margin:"0 auto", lineHeight:1.6 }}>{siteConfig.subtituloHero}</p>
            </div>
          </section>

          <section className="catalog-section" style={{ maxWidth:1600, margin:"0 auto", padding:"52px 60px" }}>
            {rifas.filter(r=>r.activa).length===0 && (
              <p style={{ color:"#9AA1AC", fontSize:14, textAlign:"center" }}>No hay rifas activas en este momento.</p>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))", gap:28 }}>
              {rifas.filter(r=>r.activa).map(r=>(
                <RifaCard key={r.id} rifa={r} vendidosCount={vendidosPorRifa(r.id)} onJugar={()=>irARifa(r)} />
              ))}
            </div>
            {rifas.filter(r=>!r.activa).length>0 && (
              <>
                <h2 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:13, color:"#9AA1AC", letterSpacing:1, marginTop:48, marginBottom:16 }}>RIFAS FINALIZADAS</h2>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))", gap:28, opacity:0.6 }}>
                  {rifas.filter(r=>!r.activa).map(r=>(
                    <RifaCard key={r.id} rifa={r} vendidosCount={vendidosPorRifa(r.id)} onJugar={()=>{}} />
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ── CÓMO FUNCIONA ── */}
          <section className="how-section" style={{ borderBottom:"1px solid #232830", padding:"64px 60px", background:"#0D0F12" }}>
            <div style={{ maxWidth:1000, margin:"0 auto" }}>
              <div style={{ textAlign:"center", marginBottom:48 }}>
                <div style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, fontWeight:800, letterSpacing:"1.5px", color:"#C6FF3D", background:"rgba(198,255,61,0.08)", border:"1px solid rgba(198,255,61,0.2)", padding:"7px 16px", borderRadius:999, marginBottom:16 }}>
                  <ShieldCheck size={12}/> 100% VERIFICABLE
                </div>
                <h2 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:"clamp(26px,3vw,40px)", lineHeight:1.1 }}>¿CÓMO FUNCIONA?</h2>
                <p style={{ color:"#9AA1AC", fontSize:15, marginTop:10 }}>Participar es fácil, rápido y seguro</p>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:24 }}>
                {[
                  { num:"01", icon:"🎟️", titulo:"Elige tu rifa", desc:"Selecciona el premio que quieres ganar y la cantidad de boletos que deseas." },
                  { num:"02", icon:"💳", titulo:"Realiza tu pago", desc:"Transfiere por banco o paga en efectivo. Sube tu captura de comprobante." },
                  { num:"03", icon:"✅", titulo:"Recibe tu número", desc:"Validamos tu pago en máximo 24 horas y te asignamos números al azar por WhatsApp." },
                  { num:"04", icon:"🎲", titulo:"¡Espera el sorteo!", desc:"El sorteo se hace en vivo y en público. El ganador se anuncia aquí mismo." },
                ].map(({ num, icon, titulo, desc }) => (
                  <div key={num} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:16, padding:"28px 22px", position:"relative", overflow:"hidden" }}>
                    <div style={{ position:"absolute", top:16, right:16, fontFamily:"'Arial Black',sans-serif", fontSize:36, color:"rgba(198,255,61,0.06)", lineHeight:1 }}>{num}</div>
                    <div style={{ fontSize:32, marginBottom:16 }}>{icon}</div>
                    <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, marginBottom:8 }}>{titulo}</div>
                    <div style={{ fontSize:13, color:"#9AA1AC", lineHeight:1.6 }}>{desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:40, textAlign:"center" }}>
                <a href="https://wa.me/18293108799?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20las%20rifas%20%F0%9F%8E%9F%EF%B8%8F" target="_blank" rel="noopener noreferrer"
                  style={{ display:"inline-flex", alignItems:"center", gap:10, background:"#25D366", color:"#fff", fontWeight:800, fontSize:14, padding:"14px 28px", borderRadius:12, textDecoration:"none", boxShadow:"0 4px 20px rgba(37,211,102,0.3)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  ¿Tienes dudas? Escríbenos por WhatsApp
                </a>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* DETALLE / COMPRA */}
      {view==="rifa" && rifaActiva && (
        <RifaDetalle rifa={rifas.find(r=>r.id===rifaActiva.id)||rifaActiva}
          agregarPendiente={agregarPendiente} showToast={showToast}
          onVolver={()=>setView("catalogo")} vendidosCount={vendidosPorRifa(rifaActiva.id)}
          reservadoPendiente={pendientes.filter(p=>p.rifaId===rifaActiva.id && p.estado==="pendiente").reduce((s,p)=>s+(p.cantidad||0),0)}
          metodosPago={metodosPago} siteConfig={siteConfig} />
      )}

      {view==="verify" && <Verify boletos={boletos} pendientes={pendientes} rifas={rifas} />}
      {view==="ganadores" && <Ganadores historial={historial} />}
      {view==="terminos" && <TerminosCondiciones siteConfig={siteConfig} onVolver={()=>setView("catalogo")} />}
      {view==="admin" && (
        <Admin boletos={boletos} saveBoletos={saveBoletos} setBoletosLocal={setBoletos}
          pendientes={pendientes} savePendientes={p=>save("pending",p,setPendientes)} setPendientesLocal={setPendientes}
          showToast={showToast} ganador={ganador} saveGanador={g=>save("ganador",g,setGanador)}
          historial={historial} saveHistorial={h=>save("historial",h,setHistorial)}
          vendidosPorRifa={vendidosPorRifa} rifas={rifas} saveRifas={r=>save("rifas",r,setRifas)}
          metodosPago={metodosPago} saveMetodosPago={mp=>save("metodosPago",mp,setMetodosPago)}
          siteConfig={siteConfig} saveSiteConfig={sc=>save("siteConfig",sc,setSiteConfig)}
          powerNumbers={powerNumbers} savePowerNumbers={pn=>save("powerNumbers",pn,setPowerNumbers)}
          premiosPower={premiosPower} savePremiosPower={pp=>save("premiosPower",pp,setPremiosPower)} setPremiosPowerLocal={setPremiosPower}
          gastosRifas={gastosRifas} saveGastosRifas={gr=>save("gastosRifas",gr,setGastosRifas)}
          notifPermiso={notifPermiso} pedirPermisoNotificaciones={pedirPermisoNotificaciones}
          onRefresh={refreshFromFirebase} />
      )}

      <footer style={{ textAlign:"center", padding:"40px 20px 50px", color:"#9AA1AC", fontSize:12, borderTop:"1px solid #232830" }}>
        <div>
          {siteConfig.logoUrl
            ? <img src={siteConfig.logoUrl} alt="" style={{ height:26, width:"auto", verticalAlign:-6 }} />
            : <Zap size={14} style={{ color: siteConfig.colorAcento, verticalAlign:-2 }}/>}
          {" "}<strong style={{ color:"#F2F2EF" }}>{siteConfig.marca}</strong>
        </div>
        <p style={{ marginTop:6 }}>{siteConfig.footerTexto}</p>
        <p style={{ marginTop:10 }}>
          <a onClick={()=>setView("terminos")} style={{ color:"#9AA1AC", textDecoration:"underline", cursor:"pointer" }}>Términos y condiciones</a>
        </p>
      </footer>

      {/* ── BOTÓN FLOTANTE WHATSAPP ── */}
      {view !== "admin" && (
        <a href="https://wa.me/18293108799?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20las%20rifas%20%F0%9F%8E%9F%EF%B8%8F"
          target="_blank" rel="noopener noreferrer"
          title="Escribenos por WhatsApp"
          className={`whatsapp-fab${view==="rifa" ? " with-buybar" : ""}`}
          style={{
            position:"fixed", bottom:24, right:24, zIndex:90,
            width:60, height:60, borderRadius:"50%",
            background:"#25D366",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 4px 20px rgba(37,211,102,0.45)",
            textDecoration:"none",
            transition:"transform .2s, box-shadow .2s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.1)";e.currentTarget.style.boxShadow="0 6px 28px rgba(37,211,102,0.6)";}}
          onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 4px 20px rgba(37,211,102,0.45)";}}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </a>
      )}
    </div>
  );
}

/* ---- Vista detalle / compra ---- */
function RifaDetalle({ rifa, agregarPendiente, showToast, onVolver, vendidosCount, reservadoPendiente, metodosPago, siteConfig }) {
  const minBol = Math.max(1, rifa.minBoletos || 1);
  // Los boletos disponibles descuentan tanto los ya vendidos (aprobados) como
  // los que ya están reservados por compras pendientes de aprobar. Así no se
  // puede comprar más de lo que la rifa realmente tiene, aunque haya varias
  // compras esperando validación al mismo tiempo (eso evitaría tener que
  // devolver dinero por sobreventa).
  const disponibles = Math.max(0, rifa.totalBoletos - vendidosCount - (reservadoPendiente||0));
  const maxBol = Math.max(minBol, disponibles);
  const combosDisponibles = (rifa.combos||[]).filter(c => c.cantidad<=disponibles).sort((a,b)=>a.cantidad-b.cantidad);
  const [comboSel, setComboSel] = useState(null);
  const [cantidad, setCantidad] = useState(minBol);
  const [showCheckout, setShowCheckout] = useState(false);
  const total = comboSel ? comboSel.precio : cantidad * rifa.precio;
  const cantidadFinal = comboSel ? comboSel.cantidad : cantidad;
  const elegirCombo = (combo) => { setComboSel(combo); setCantidad(combo.cantidad); };
  const elegirLibre = () => { setComboSel(null); };
  const vencida = sorteoVencido(rifa.fechaSorteo, rifa.horaSorteo || "23:59");
  const cerrada = !rifa.activa || disponibles <= 0 || vencida;
  return (
    <main style={{ maxWidth:560, margin:"0 auto", padding:"40px 20px" }}>
      <button onClick={onVolver} style={{ background:"none", border:"none", color:"#9AA1AC", fontSize:13, cursor:"pointer", marginBottom:24, display:"flex", alignItems:"center", gap:6 }}>← Volver al catálogo</button>
      <RifaCard rifa={rifa} vendidosCount={vendidosCount} onJugar={()=>{ if(!cerrada) setShowCheckout(true); }} />
      {cerrada ? (
        <div style={{ marginTop:32, textAlign:"center", background:"#14171C", border:"1px solid #232830", borderRadius:14, padding:"28px 20px" }}>
          <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:16, color:"#FF5470", marginBottom:6 }}>
            {vencida ? "El tiempo para comprar boletos terminó" : "Esta rifa ya no admite compras"}
          </div>
          <p style={{ color:"#9AA1AC", fontSize:13 }}>
            {vencida ? "El sorteo ya cerró su periodo de venta." : "Todos los boletos fueron vendidos."}
          </p>
        </div>
      ) : (
      <div style={{ marginTop:32 }}>
        <h2 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:18, marginBottom:6 }}>ELIGE TU CANTIDAD</h2>
        <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:6 }}>Los números se asignan al azar al aprobar tu pago.</p>
        {minBol > 1 && combosDisponibles.length===0 && (
          <p style={{ color:"#f59e0b", fontSize:12, fontWeight:700, marginBottom:20 }}>Mínimo de compra: {minBol} boletos</p>
        )}

        {combosDisponibles.length > 0 && (
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#9AA1AC", letterSpacing:"0.5px", marginBottom:2 }}>SELECCIONA UN PAQUETE</div>
            <div style={{ fontSize:11, color:"#5a6170", marginBottom:14 }}>A mayor cantidad, más oportunidades de ganar</div>
            <div style={{ display:"grid", gridTemplateColumns:`repeat(${Math.min(combosDisponibles.length,3)}, 1fr)`, gap:12 }}>
              {combosDisponibles.map(combo => {
                const activo = comboSel?.id === combo.id;
                const color = combo.color || "#C6FF3D";
                const Icono = ICONOS_COMBO[combo.icono] || Trophy;
                return (
                  <button key={combo.id} onClick={()=>elegirCombo(combo)}
                    style={{
                      position:"relative", textAlign:"center", background: activo?`${color}14`:"#14171C",
                      border:`1.5px solid ${activo?color:"#232830"}`, borderRadius:14, padding:"18px 8px 14px",
                      cursor:"pointer", transition:"box-shadow .2s, border-color .2s",
                      boxShadow: activo?`0 0 22px ${color}55`:"none",
                    }}>
                    {combo.etiqueta && (
                      <span style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", background:color, color:"#0D0F12", fontSize:9, fontWeight:800, padding:"3px 10px", borderRadius:999, whiteSpace:"nowrap", boxShadow:`0 0 10px ${color}88` }}>★ {combo.etiqueta}</span>
                    )}
                    <div style={{ width:38, height:38, borderRadius:"50%", background:`${color}1f`, border:`1px solid ${color}66`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 8px" }}>
                      <Icono size={18} style={{ color }}/>
                    </div>
                    {combo.nombre && (
                      <div style={{ fontSize:10, fontWeight:800, letterSpacing:"1px", color, marginBottom:6 }}>{combo.nombre}</div>
                    )}
                    <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:24, color: activo?color:"#F2F2EF", lineHeight:1 }}>{combo.cantidad}</div>
                    <div style={{ fontSize:9, color:"#9AA1AC", textTransform:"uppercase", letterSpacing:"0.5px", margin:"4px 0 10px" }}>números</div>
                    <div style={{ borderTop:"1px solid #232830", paddingTop:8, fontSize:13, fontWeight:800, color:"#F2F2EF" }}>{fmtMoney(combo.precio)}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={elegirLibre} style={{
                width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                background:"rgba(198,255,61,0.05)", border:"1.5px dashed rgba(198,255,61,0.4)", color: comboSel?"#9AA1AC":"#C6FF3D",
                fontSize:12, fontWeight:700, marginTop:14, padding:"12px 0", borderRadius:10, cursor:"pointer",
              }}>
              {comboSel ? "Elegir cantidad personalizada" : "✓ Usando cantidad personalizada"}
            </button>
            {minBol > 1 && <p style={{ textAlign:"center", fontSize:11, color:"#5a6170", marginTop:8 }}>Mínimo {minBol} boletos</p>}
          </div>
        )}

        {!comboSel && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:24, marginBottom:16, marginTop: minBol>1?0:20 }}>
          <button onClick={()=>setCantidad(c=>Math.max(minBol,c-minBol))} disabled={cantidad<=minBol} style={{ width:48, height:48, borderRadius:12, background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", fontSize:22, fontWeight:700, cursor:"pointer", opacity:cantidad<=minBol?0.4:1 }}>−</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:40, color:"#C6FF3D" }}>{cantidad}</div>
            <div style={{ fontSize:12, color:"#9AA1AC", textTransform:"uppercase" }}>boleto{cantidad>1?"s":""}</div>
          </div>
          <button onClick={()=>setCantidad(c=>Math.min(maxBol,c+minBol))} disabled={cantidad>=maxBol} style={{ width:48, height:48, borderRadius:12, background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", fontSize:22, fontWeight:700, cursor:"pointer", opacity:cantidad>=maxBol?0.4:1 }}>+</button>
        </div>
        )}
        <div className="buy-inline" style={{ textAlign:"center", fontSize:15, marginBottom:18 }}>Total: <strong style={{ fontFamily:"'Arial Black',sans-serif", color:"#C6FF3D" }}>{fmtMoney(total)}</strong></div>
        <button className="buy-inline" onClick={()=>setShowCheckout(true)} style={{ width:"100%", background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:14, padding:"14px 20px", borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}>
          Comprar {cantidadFinal} boleto{cantidadFinal>1?"s":""} <ChevronRight size={16}/>
        </button>
        {/* Barra fija abajo, solo en celular (ver estilos @media) */}
        <div className="buy-bar" style={{ display:"none" }}>
          <div>
            <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:20, color:"#F2F2EF", lineHeight:1 }}>{fmtMoney(total)}</div>
            <div style={{ fontSize:11, color:"#9AA1AC", marginTop:3 }}>{cantidadFinal} boleto{cantidadFinal>1?"s":""}</div>
          </div>
          <button onClick={()=>setShowCheckout(true)} style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:14, padding:"14px 26px", borderRadius:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            COMPRAR <ChevronRight size={16}/>
          </button>
        </div>
        <div className="buy-bar-spacer" style={{ display:"none" }} />
      </div>
      )}
      {showCheckout && !cerrada && (
        <CheckoutModal selected={cantidadFinal} total={total} metodosPago={metodosPago} siteConfig={siteConfig} onClose={()=>setShowCheckout(false)}
          onConfirm={async(datos)=>{
            const nuevo={id:"P"+Date.now(),...datos,cantidad:cantidadFinal,total,rifaId:rifa.id,rifaTitulo:rifa.titulo,fecha:new Date().toISOString(),estado:"pendiente"};
            const ok = await agregarPendiente(nuevo);
            if(ok===false){
              showToast("Error al guardar. Intenta de nuevo o contacta al organizador.","warn");
              return;
            }
            setShowCheckout(false); setCantidad(minBol); setComboSel(null);
            showToast("¡Compra recibida! Validaremos tu pago en máximo 24 horas.","ok");
          }} />
      )}
    </main>
  );
}

/* ---- Checkout ---- */
function CheckoutModal({ selected, total, onClose, onConfirm, metodosPago, siteConfig }) {
  const metodos = (metodosPago||[]).filter(m=>m.activo);
  const [nombre,setNombre]=useState("");
  const [telefono,setTelefono]=useState("");
  const [metodoId,setMetodoId]=useState(()=> (metodosPago||[]).filter(m=>m.activo)[0]?.id || "");
  const [acepta,setAcepta]=useState(false);
  const [copiado,setCopiado]=useState(null);
  const [captura,setCaptura]=useState("");
  const [codigoEfectivo,setCodigoEfectivo]=useState("");
  const capturaRef = useRef(null);
  const metodoSel = metodos.find(m=>m.id===metodoId);
  const esEfectivo = metodoSel?.tipo==="efectivo";
  const codigoEfectivoOk = !esEfectivo || codigoEfectivo === (siteConfig?.codigoEfectivo || "0000");
  const valido=nombre.trim().length>2&&telefono.trim().length>=10&&acepta&&!!metodoSel&&(esEfectivo?codigoEfectivoOk:captura);
  const copiarDatos = (texto, id) => { navigator.clipboard?.writeText(texto); setCopiado(id); setTimeout(()=>setCopiado(null),1800); };

  const cargarCaptura = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        setCaptura(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:100, backdropFilter:"blur(2px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:"18px 18px 0 0", padding:"26px 22px 36px", maxWidth:440, width:"100%", maxHeight:"90vh", overflowY:"auto", position:"relative" }}>
        <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"#232830", border:"none", color:"#F2F2EF", width:30, height:30, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:18, marginBottom:16 }}>Confirmar compra</h3>
        <div style={{ display:"flex", alignItems:"center", gap:10, background:"#0D0F12", border:"1px solid #232830", borderRadius:10, padding:14, marginBottom:14, flexWrap:"wrap" }}>
          <Zap size={18} style={{ color:"#C6FF3D" }}/><span><strong>{selected}</strong> boleto{selected>1?"s":""}</span>
          <span style={{ fontSize:11, color:"#9AA1AC", width:"100%" }}>Números asignados al azar al aprobar el pago</span>
        </div>
        <div style={{ fontSize:14, marginBottom:18, paddingBottom:18, borderBottom:"1px solid #232830" }}>Total: <strong style={{ color:"#C6FF3D", fontFamily:"'Arial Black',sans-serif", fontSize:17 }}>{fmtMoney(total)}</strong></div>
        {[["Nombre completo *",nombre,setNombre,"Tu nombre y apellido","text"],["Teléfono (WhatsApp) *",telefono,setTelefono,"809-000-0000","tel"]].map(([lbl,val,set,ph,type])=>(
          <label key={lbl} style={{ display:"block", marginBottom:14 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>{lbl}</span>
            <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
              style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
          </label>
        ))}
        {/* METODO DE PAGO */}
        <div style={{ marginBottom:16 }}>
          <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:10 }}>MÉTODO DE PAGO *</span>
          {metodos.length===0 && <div style={{ fontSize:13, color:"#FF5470", padding:12, background:"rgba(255,84,112,0.08)", border:"1px solid rgba(255,84,112,0.2)", borderRadius:9 }}>No hay métodos de pago activos. Contacta al organizador.</div>}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {metodos.map(m=>(
              <button key={m.id} onClick={()=>setMetodoId(m.id)}
                style={{ display:"flex", alignItems:"center", gap:12, background:metodoId===m.id?"rgba(198,255,61,0.07)":"#0D0F12", border:`1.5px solid ${metodoId===m.id?"#C6FF3D":"#232830"}`, borderRadius:10, padding:"12px 14px", cursor:"pointer", textAlign:"left", width:"100%" }}>
                <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${metodoId===m.id?"#C6FF3D":"#232830"}`, background:metodoId===m.id?"#C6FF3D":"transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {metodoId===m.id && <div style={{ width:8, height:8, borderRadius:"50%", background:"#0D0F12" }} />}
                </div>
                {m.logoUrl && (
                  <div style={{ width:32, height:32, borderRadius:8, background:"#14171C", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                    <img src={m.logoUrl} alt="" style={{ maxWidth:"100%", maxHeight:"100%" }} />
                  </div>
                )}
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#F2F2EF" }}>{m.nombre}</div>
                  {m.tipo==="banco" && m.titular && <div style={{ fontSize:11, color:"#9AA1AC", marginTop:2 }}>{m.titular}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
        {metodoSel && metodoSel.tipo==="banco" && metodoSel.cuenta && (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#0D0F12", border:"1px solid rgba(198,255,61,0.2)", borderRadius:10, padding:"12px 14px", marginBottom:16, gap:10 }}>
            <div>
              <div style={{ fontSize:11, color:"#9AA1AC", marginBottom:3 }}>Transferir a</div>
              <div style={{ fontSize:13, fontWeight:700 }}>{metodoSel.cuenta}</div>
              {metodoSel.titular && <div style={{ fontSize:12, color:"#9AA1AC", marginTop:2 }}>A nombre de: {metodoSel.titular}</div>}
            </div>
            <button onClick={()=>copiarDatos(`${metodoSel.cuenta} · ${metodoSel.nombre}${metodoSel.titular?" · "+metodoSel.titular:""}`, metodoSel.id)}
              style={{ background:"#232830", border:"none", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"8px 12px", borderRadius:8, cursor:"pointer", whiteSpace:"nowrap" }}>
              {copiado===metodoSel.id?"¡Copiado!":"Copiar"}
            </button>
          </div>
        )}
        {metodoSel && metodoSel.tipo==="efectivo" && (
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", gap:10, background:"rgba(198,255,61,0.05)", border:"1px solid rgba(198,255,61,0.2)", borderRadius:10, padding:"12px 14px", marginBottom:12, fontSize:13, color:"#9AA1AC" }}>
              <Zap size={16} style={{ color:"#C6FF3D", flexShrink:0, marginTop:1 }}/> El organizador coordinará contigo el pago en persona por WhatsApp.
            </div>
            <label style={{ display:"block" }}>
              <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Código de autorización *</span>
              <input type="password" value={codigoEfectivo} onChange={e=>setCodigoEfectivo(e.target.value)} placeholder="Solo el organizador conoce este código"
                style={{ width:"100%", background:"#0D0F12", border:`1px solid ${codigoEfectivo && !codigoEfectivoOk ? "#f87171" : "#232830"}`, color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
              {codigoEfectivo && !codigoEfectivoOk && (
                <p style={{ fontSize:11, color:"#f87171", marginTop:6 }}>Código incorrecto.</p>
              )}
            </label>
          </div>
        )}

        {/* CAPTURA DE PANTALLA — solo si es transferencia bancaria */}
        {metodoSel && metodoSel.tipo!=="efectivo" && (
          <div style={{ marginBottom:16 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:8 }}>📸 CAPTURA DEL PAGO *</span>
            {captura ? (
              <div style={{ position:"relative", borderRadius:10, overflow:"hidden", border:"1px solid rgba(198,255,61,0.3)", marginBottom:6 }}>
                <img src={captura} alt="Captura de pago" style={{ width:"100%", display:"block", maxHeight:220, objectFit:"cover" }} />
                <button onClick={()=>setCaptura("")} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.75)", border:"1px solid rgba(255,84,112,0.5)", color:"#FF5470", width:28, height:28, borderRadius:7, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><X size={14}/></button>
              </div>
            ) : (
              <>
                <input ref={capturaRef} type="file" accept="image/*" onChange={cargarCaptura} style={{ display:"none" }} />
                <button onClick={()=>capturaRef.current?.click()}
                  style={{ width:"100%", background:"#0D0F12", border:"2px dashed #232830", color:"#9AA1AC", fontSize:13, fontWeight:700, padding:"16px 0", borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:6 }}>
                  <ImagePlus size={16}/> Adjuntar captura de la transferencia
                </button>
              </>
            )}
            <p style={{ fontSize:11, color:"#5a6170" }}>Sube la captura o foto del comprobante de pago para validar más rápido.</p>
          </div>
        )}

        <label style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:12, color:"#9AA1AC", marginBottom:18 }}>
          <input type="checkbox" checked={acepta} onChange={e=>setAcepta(e.target.checked)} style={{ marginTop:2, accentColor:"#C6FF3D" }}/>
          Confirmo que mis datos son correctos.
        </label>
        <button disabled={!valido} onClick={()=>onConfirm({nombre,telefono,metodo:metodoSel?.nombre||"",captura:captura||""})}
          style={{ width:"100%", background:valido?"#C6FF3D":"#232830", color:valido?"#0D0F12":"#9AA1AC", border:"none", fontWeight:800, fontSize:14, padding:14, borderRadius:10, cursor:valido?"pointer":"not-allowed", display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}>
          Confirmar compra
        </button>
        <p style={{ fontSize:11, color:"#9AA1AC", marginTop:12, textAlign:"center" }}>Tu compra será validada en máximo 24 horas.</p>
      </div>
    </div>
  );
}

/* ============================================================
   EDITOR DE GANADOR
   ============================================================ */
function EditorGanador({ ganador, onGuardar, onCancelar }) {
  const esNuevo = !ganador;
  const hoy = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState(ganador ? {
    ...ganador,
    fecha: ganador.fecha ? new Date(ganador.fecha).toISOString().slice(0,10) : hoy,
  } : {
    id: "",
    premio: "",
    nombre: "",
    numero: "",
    telefono: "",
    fecha: hoy,
    foto: "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valido = form.premio.trim() && form.nombre.trim() && form.numero.trim() && form.fecha;
  const fotoInputRef = useRef(null);
  const [linkFoto, setLinkFoto] = useState(form.foto||"");
  const [fotoTab, setFotoTab] = useState("url"); // "url" | "archivo"

  const guardar = () => {
    if (!valido) return;
    onGuardar({ ...form, fecha: new Date(form.fecha).toISOString() });
  };

  const aplicarUrl = () => {
    const url = linkFoto.trim();
    if (!url) return;
    set("foto", url);
  };

  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const comprimirFotoGanador = (dataUrl, maxPx, quality, cb) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  };

  const cargarArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoFoto(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      // Comprimimos la foto antes de guardarla: una foto de celular sin comprimir
      // puede pesar varios MB y Firebase solo permite 1MB por documento, lo que
      // hacía fallar el guardado completo del ganador (no solo la foto).
      comprimirFotoGanador(ev.target.result, 1000, 0.78, (compressed) => {
        set("foto", compressed);
        setLinkFoto("");
        setSubiendoFoto(false);
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div onClick={onCancelar} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:18, width:"100%", maxWidth:500, maxHeight:"92vh", overflowY:"auto", position:"relative" }}>
        {/* Header */}
        <div style={{ padding:"20px 22px 16px", borderBottom:"1px solid #232830", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:"#14171C", zIndex:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <Trophy size={18} style={{ color:"#C6FF3D" }}/>
            <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:16 }}>{esNuevo?"AGREGAR GANADOR":"EDITAR GANADOR"}</h3>
          </div>
          <button onClick={onCancelar} style={{ background:"#232830", border:"none", color:"#F2F2EF", width:30, height:30, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><X size={16}/></button>
        </div>

        {/* Body */}
        <div style={{ padding:"20px 22px", display:"flex", flexDirection:"column", gap:14 }}>
          <label style={{ display:"block" }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>PREMIO / DESCRIPCIÓN *</span>
            <input value={form.premio} onChange={e=>set("premio",e.target.value)}
              placeholder="Ej: Scooter Eléctrica Yamaha E-Vino"
              style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
          </label>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <label style={{ display:"block" }}>
              <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>NOMBRE DEL GANADOR *</span>
              <input value={form.nombre} onChange={e=>set("nombre",e.target.value)}
                placeholder="Nombre completo"
                style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
            </label>
            <label style={{ display:"block" }}>
              <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>NÚMERO DE BOLETO *</span>
              <input value={form.numero} onChange={e=>set("numero",e.target.value)}
                placeholder="Ej: 047"
                style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
            </label>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <label style={{ display:"block" }}>
              <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>TELÉFONO</span>
              <input value={form.telefono||""} onChange={e=>set("telefono",e.target.value)}
                placeholder="809-000-0000"
                style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
            </label>
            <label style={{ display:"block" }}>
              <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>FECHA DEL SORTEO *</span>
              <input type="date" value={form.fecha} onChange={e=>set("fecha",e.target.value)}
                style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
            </label>
          </div>

          {/* ---- FOTO DEL GANADOR ---- */}
          <div>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:8 }}>FOTO DEL GANADOR <span style={{ fontWeight:400, color:"#5a6170" }}>(opcional)</span></span>

            {/* Vista previa de la foto si existe */}
            {form.foto && (
              <div style={{ position:"relative", width:"100%", paddingBottom:"177.78%", borderRadius:10, overflow:"hidden", marginBottom:10, border:"1px solid #232830" }}>
                <img src={form.foto} alt="Foto del ganador" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                <button onClick={()=>{ set("foto",""); setLinkFoto(""); }}
                  style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.75)", border:"1px solid rgba(255,84,112,0.5)", color:"#FF5470", width:30, height:30, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <X size={15}/>
                </button>
              </div>
            )}

            {/* Tabs URL / Archivo */}
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              {[["url","🔗 Link / URL"],["archivo","📁 Desde mi dispositivo"]].map(([id,lbl])=>(
                <button key={id} onClick={()=>setFotoTab(id)}
                  style={{ flex:1, background:fotoTab===id?"rgba(198,255,61,0.1)":"#0D0F12", border:`1px solid ${fotoTab===id?"#C6FF3D":"#232830"}`, color:fotoTab===id?"#C6FF3D":"#9AA1AC", fontSize:11, fontWeight:700, padding:"8px 6px", borderRadius:8, cursor:"pointer" }}>
                  {lbl}
                </button>
              ))}
            </div>

            {fotoTab==="url" && (
              <div style={{ display:"flex", gap:8 }}>
                <input value={linkFoto} onChange={e=>setLinkFoto(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&aplicarUrl()}
                  placeholder="https://i.imgur.com/ejemplo.jpg"
                  style={{ flex:1, background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"10px 12px", borderRadius:9, fontSize:13, outline:"none" }} />
                <button onClick={aplicarUrl}
                  style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:12, padding:"10px 14px", borderRadius:9, cursor:"pointer", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" }}>
                  <ImagePlus size={14}/> Aplicar
                </button>
              </div>
            )}

            {fotoTab==="archivo" && (
              <div>
                <input ref={fotoInputRef} type="file" accept="image/*" onChange={cargarArchivo} style={{ display:"none" }} />
                <button onClick={()=>fotoInputRef.current?.click()}
                  style={{ width:"100%", background:"#0D0F12", border:"2px dashed #232830", color:"#9AA1AC", fontSize:13, fontWeight:700, padding:"18px 0", borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  <ImagePlus size={16}/> Seleccionar foto del dispositivo
                </button>
                <p style={{ fontSize:11, color:"#5a6170", marginTop:6, textAlign:"center" }}>JPG, PNG, WEBP · máx. recomendado 5 MB</p>
              </div>
            )}
          </div>

          {/* Preview card */}
          {form.premio && form.nombre && form.numero && (
            <div style={{ background:"rgba(198,255,61,0.05)", border:"1px solid rgba(198,255,61,0.2)", borderRadius:10, overflow:"hidden" }}>
              {form.foto && (
                <div style={{ width:"100%", paddingBottom:"177.78%", overflow:"hidden", position:"relative" }}>
                  <img src={form.foto} alt={form.nombre} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                  <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(20,23,28,0.9) 0%, transparent 60%)" }} />
                  <div style={{ position:"absolute", bottom:8, left:12, right:12 }}>
                    <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:13, color:"#F2F2EF" }}>{form.nombre}</div>
                    <div style={{ fontSize:11, color:"#C6FF3D", fontWeight:700 }}>Boleto #{form.numero} · {form.premio}</div>
                  </div>
                </div>
              )}
              {!form.foto && (
                <div style={{ padding:"12px 14px", display:"flex", alignItems:"center", gap:12 }}>
                  <Trophy size={20} style={{ color:"#C6FF3D", flexShrink:0 }}/>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{form.premio}</div>
                    <div style={{ fontSize:12, color:"#9AA1AC", marginTop:2 }}>{form.nombre} · Boleto #{form.numero}{form.fecha && ` · ${new Date(form.fecha).toLocaleDateString("es-DO")}`}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"16px 22px", borderTop:"1px solid #232830", display:"flex", gap:10, position:"sticky", bottom:0, background:"#14171C" }}>
          <button onClick={onCancelar} style={{ flex:1, background:"none", border:"1px solid #232830", color:"#F2F2EF", fontWeight:700, fontSize:13, padding:"12px 0", borderRadius:10, cursor:"pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={!valido || subiendoFoto}
            style={{ flex:2, background:(valido&&!subiendoFoto)?"#C6FF3D":"#232830", color:(valido&&!subiendoFoto)?"#0D0F12":"#9AA1AC", border:"none", fontWeight:800, fontSize:13, padding:"12px 0", borderRadius:10, cursor:(valido&&!subiendoFoto)?"pointer":"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Check size={15}/> {subiendoFoto?"Procesando foto…":(esNuevo?"Agregar al historial":"Guardar cambios")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   EDITOR DE MÉTODO DE PAGO
   ============================================================ */
function EditorMetodoPago({ metodo, onGuardar, onCancelar }) {
  const esNuevo = !metodo;
  const [form, setForm] = useState(metodo ? { ...metodo } : {
    id: "mp-" + Date.now(),
    tipo: "banco",
    nombre: "",
    titular: "",
    cuenta: "",
    instrucciones: "",
    logoUrl: "",
    activo: true,
  });
  const [subiendoLogoMetodo, setSubiendoLogoMetodo] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valido = form.nombre.trim().length > 0;

  const cargarLogoMetodo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoLogoMetodo(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      comprimirImagen(ev.target.result, 200, (compressed) => {
        set("logoUrl", compressed);
        setSubiendoLogoMetodo(false);
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div onClick={onCancelar} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:18, width:"100%", maxWidth:480, position:"relative" }}>
        {/* Header */}
        <div style={{ padding:"20px 22px 16px", borderBottom:"1px solid #232830", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:16 }}>{esNuevo?"NUEVO MÉTODO DE PAGO":"EDITAR MÉTODO"}</h3>
          <button onClick={onCancelar} style={{ background:"#232830", border:"none", color:"#F2F2EF", width:30, height:30, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><X size={16}/></button>
        </div>

        {/* Body */}
        <div style={{ padding:"20px 22px" }}>
          {/* Tipo */}
          <div style={{ marginBottom:18 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:10 }}>TIPO DE MÉTODO</span>
            <div style={{ display:"flex", gap:8 }}>
              {[["banco","🏦 Transferencia bancaria"],["efectivo","💵 Efectivo / en persona"],["otro","📱 Otro (Sinpe, PayPal, etc.)"]].map(([val,lbl])=>(
                <button key={val} onClick={()=>set("tipo",val)}
                  style={{ flex:1, background:form.tipo===val?"rgba(198,255,61,0.1)":"#0D0F12", border:`1.5px solid ${form.tipo===val?"#C6FF3D":"#232830"}`, color:form.tipo===val?"#C6FF3D":"#9AA1AC", fontSize:11, fontWeight:700, padding:"10px 6px", borderRadius:9, cursor:"pointer", lineHeight:1.4 }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Nombre del método */}
          <label style={{ display:"block", marginBottom:14 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>NOMBRE DEL MÉTODO *</span>
            <input value={form.nombre} onChange={e=>set("nombre",e.target.value)}
              placeholder={form.tipo==="banco"?"Ej: Banco Popular · BHD · Banreservas":form.tipo==="efectivo"?"Ej: Efectivo (en persona)":"Ej: Sinpe Móvil · PayPal"}
              style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
          </label>

          {/* Logo del método */}
          <div style={{ marginBottom:18 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:8 }}>LOGO (opcional)</span>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:52, height:52, borderRadius:10, background:"#0D0F12", border:"1px solid #232830", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                {form.logoUrl ? <img src={form.logoUrl} alt="" style={{ maxWidth:"100%", maxHeight:"100%" }} /> : <ImagePlus size={18} style={{ color:"#5a6170" }}/>}
              </div>
              <div>
                <label style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#232830", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:8, cursor:subiendoLogoMetodo?"not-allowed":"pointer", opacity:subiendoLogoMetodo?0.6:1, width:"fit-content" }}>
                  <ImagePlus size={14}/> {subiendoLogoMetodo ? "Procesando…" : (form.logoUrl ? "Cambiar logo" : "Subir logo")}
                  <input type="file" accept="image/*" disabled={subiendoLogoMetodo} onChange={cargarLogoMetodo} style={{ display:"none" }} />
                </label>
                {form.logoUrl && (
                  <button onClick={()=>set("logoUrl","")} style={{ display:"block", background:"none", border:"none", color:"#FF5470", fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"left", padding:"6px 0 0" }}>
                    Quitar logo
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize:11, color:"#5a6170", marginTop:8 }}>Sube una imagen del logo de tu banco o del método (una captura o el logo oficial que ya tengas guardado).</p>
          </div>

          {/* Campos de banco */}
          {form.tipo==="banco" && (
            <>
              <label style={{ display:"block", marginBottom:14 }}>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>NÚMERO DE CUENTA / TELÉFONO</span>
                <input value={form.cuenta||""} onChange={e=>set("cuenta",e.target.value)}
                  placeholder="Ej: 809-555-0118 o 20200012345"
                  style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
              </label>
              <label style={{ display:"block", marginBottom:14 }}>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>TITULAR DE LA CUENTA</span>
                <input value={form.titular||""} onChange={e=>set("titular",e.target.value)}
                  placeholder="Ej: Hiraldo Power"
                  style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
              </label>
            </>
          )}

          {/* Instrucciones adicionales */}
          <label style={{ display:"block", marginBottom:18 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>INSTRUCCIONES (opcional)</span>
            <textarea value={form.instrucciones||""} onChange={e=>set("instrucciones",e.target.value)}
              placeholder="Ej: Enviar captura del pago al WhatsApp 809-000-0000"
              rows={3}
              style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:13, outline:"none", resize:"vertical", fontFamily:"inherit", lineHeight:1.5 }} />
          </label>

          {/* Toggle activo */}
          <label style={{ display:"flex", gap:12, alignItems:"center", marginBottom:4, cursor:"pointer" }}>
            <div onClick={()=>set("activo",!form.activo)} style={{ width:48, height:26, borderRadius:999, background:form.activo?"#C6FF3D":"#232830", position:"relative", transition:"background .2s", cursor:"pointer", flexShrink:0 }}>
              <div style={{ position:"absolute", top:3, left:form.activo?24:3, width:20, height:20, borderRadius:999, background:form.activo?"#0D0F12":"#9AA1AC", transition:"left .2s" }} />
            </div>
            <span style={{ fontSize:13, fontWeight:700, color:form.activo?"#C6FF3D":"#9AA1AC" }}>{form.activo?"ACTIVO — visible para clientes":"INACTIVO — oculto para clientes"}</span>
          </label>
        </div>

        {/* Footer */}
        <div style={{ padding:"16px 22px", borderTop:"1px solid #232830", display:"flex", gap:10 }}>
          <button onClick={onCancelar} style={{ flex:1, background:"none", border:"1px solid #232830", color:"#F2F2EF", fontWeight:700, fontSize:13, padding:"12px 0", borderRadius:10, cursor:"pointer" }}>Cancelar</button>
          <button onClick={()=>valido&&onGuardar(form)} disabled={!valido}
            style={{ flex:2, background:valido?"#C6FF3D":"#232830", color:valido?"#0D0F12":"#9AA1AC", border:"none", fontWeight:800, fontSize:13, padding:"12px 0", borderRadius:10, cursor:valido?"pointer":"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Check size={15}/> {esNuevo?"Agregar método":"Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- ConfirmInline — reemplaza window.confirm ---- */
function ConfirmInline({ mensaje, onSi, onNo }) {
  return (
    <div style={{ background:"rgba(255,84,112,0.08)", border:"1px solid rgba(255,84,112,0.3)", borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
      <span style={{ flex:1, fontSize:13, color:"#F2F2EF" }}>{mensaje}</span>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onNo} style={{ background:"#232830", border:"none", color:"#F2F2EF", fontWeight:700, fontSize:12, padding:"8px 14px", borderRadius:8, cursor:"pointer" }}>Cancelar</button>
        <button onClick={onSi} style={{ background:"#FF5470", border:"none", color:"#fff", fontWeight:800, fontSize:12, padding:"8px 14px", borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}><Trash2 size={13}/> Eliminar</button>
      </div>
    </div>
  );
}

function RifaRow({ r, onEditar, onEliminar }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ background:"#14171C", border:`1px solid ${r.activa?"rgba(198,255,61,0.2)":"#232830"}`, borderRadius:12, overflow:"hidden" }}>
      <div style={{ padding:16, display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ width:72, height:56, borderRadius:8, background:"#0D0F12", overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {r.imagen ? <img src={r.imagen} alt={r.titulo} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <Trophy size={20} style={{ opacity:0.2, color:"#9AA1AC" }} />}
        </div>
        <div style={{ flex:1, minWidth:180 }}>
          <div style={{ fontWeight:700, fontSize:14, display:"flex", alignItems:"center", gap:8 }}>
            {r.titulo}
            <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:999, background:r.activa?"rgba(198,255,61,0.15)":"rgba(255,84,112,0.12)", color:r.activa?"#C6FF3D":"#FF5470" }}>{r.activa?"ACTIVA":"INACTIVA"}</span>
          </div>
          <div style={{ fontSize:12, color:"#9AA1AC", marginTop:3 }}>{fmtMoney(r.precio)} · {r.totalBoletos} boletos · Sorteo {new Date(r.fechaSorteo).toLocaleDateString("es-DO")}</div>
          {r.etiqueta && <div style={{ marginTop:4 }}><span style={{ fontSize:10, fontWeight:800, background:r.etiquetaColor||"#FF6B35", color:"#fff", padding:"2px 8px", borderRadius:999 }}>{r.etiqueta}</span></div>}
        </div>
        <div style={{ display:"flex", gap:8, flexShrink:0 }}>
          <button onClick={onEditar} style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"none", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:9, cursor:"pointer" }}><Pencil size={14}/> Editar</button>
          <button onClick={()=>setConfirm(true)} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"1px solid rgba(255,84,112,0.3)", color:"#FF5470", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:9, cursor:"pointer" }}><Trash2 size={14}/></button>
        </div>
      </div>
      {confirm && <div style={{ padding:"0 16px 14px" }}><ConfirmInline mensaje="¿Eliminar esta rifa permanentemente?" onSi={onEliminar} onNo={()=>setConfirm(false)} /></div>}
    </div>
  );
}

function MetodoPagoRow({ m, onEditar, onEliminar }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ background:"#14171C", border:`1px solid ${m.activo?"rgba(198,255,61,0.2)":"#232830"}`, borderRadius:12, overflow:"hidden" }}>
      <div style={{ padding:16, display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ width:40, height:40, borderRadius:9, background:"#0D0F12", border:"1px solid #232830", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
          {m.logoUrl ? <img src={m.logoUrl} alt="" style={{ maxWidth:"100%", maxHeight:"100%" }} /> : <ImagePlus size={15} style={{ color:"#5a6170" }}/>}
        </div>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontWeight:700, fontSize:14, display:"flex", alignItems:"center", gap:8 }}>
            {m.nombre}
            <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:999, background:m.activo?"rgba(198,255,61,0.15)":"rgba(255,84,112,0.12)", color:m.activo?"#C6FF3D":"#FF5470" }}>{m.activo?"ACTIVO":"INACTIVO"}</span>
          </div>
          {m.tipo==="banco" && <div style={{ fontSize:12, color:"#9AA1AC", marginTop:4 }}>{m.cuenta && <span>{m.cuenta}</span>}{m.titular && <span> · {m.titular}</span>}</div>}
          {m.tipo==="efectivo" && <div style={{ fontSize:12, color:"#9AA1AC", marginTop:4 }}>Pago presencial</div>}
        </div>
        <div style={{ display:"flex", gap:8, flexShrink:0 }}>
          <button onClick={onEditar} style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"none", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:9, cursor:"pointer" }}><Pencil size={14}/> Editar</button>
          <button onClick={()=>setConfirm(true)} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"1px solid rgba(255,84,112,0.3)", color:"#FF5470", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:9, cursor:"pointer" }}><Trash2 size={14}/></button>
        </div>
      </div>
      {confirm && <div style={{ padding:"0 16px 14px" }}><ConfirmInline mensaje="¿Eliminar este método de pago?" onSi={onEliminar} onNo={()=>setConfirm(false)} /></div>}
    </div>
  );
}

function GanadorRow({ h, onEditar, onEliminar }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ background:"#14171C", border:"1px solid rgba(198,255,61,0.15)", borderRadius:12, overflow:"hidden" }}>
      <div style={{ padding:"14px 16px", display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
        <Trophy size={20} style={{ color:"#C6FF3D", flexShrink:0 }}/>
        <div style={{ flex:1, minWidth:180 }}>
          <div style={{ fontWeight:700, fontSize:14 }}>{h.premio}</div>
          <div style={{ fontSize:12, color:"#9AA1AC", marginTop:3 }}>
            {h.nombre} · Boleto #{h.numero}
            {h.telefono && <span> · {h.telefono}</span>}
          </div>
          <div style={{ fontSize:11, color:"#9AA1AC", marginTop:2 }}>{new Date(h.fecha).toLocaleDateString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric"})}</div>
        </div>
        <div style={{ display:"flex", gap:8, flexShrink:0 }}>
          <button onClick={onEditar} style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"none", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:9, cursor:"pointer" }}><Pencil size={14}/> Editar</button>
          <button onClick={()=>setConfirm(true)} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"1px solid rgba(255,84,112,0.3)", color:"#FF5470", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:9, cursor:"pointer" }}><Trash2 size={14}/></button>
        </div>
      </div>
      {confirm && <div style={{ padding:"0 16px 14px" }}><ConfirmInline mensaje="¿Eliminar este ganador del historial?" onSi={onEliminar} onNo={()=>setConfirm(false)} /></div>}
    </div>
  );
}

function BoletoVendidoRow({ num, info, onEliminar }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ background:"#14171C" }}>
      <div style={{ display:"grid", gridTemplateColumns:"60px 1fr auto auto", alignItems:"center", gap:12, padding:"10px 14px", fontSize:13 }}>
        <span style={{ background:"#C6FF3D", color:"#0D0F12", fontFamily:"'Arial Black',sans-serif", fontSize:11, padding:"4px 8px", borderRadius:6, textAlign:"center" }}>{num}</span>
        <span>{info.nombre}</span>
        <span style={{ fontSize:12, color:"#9AA1AC" }}>{info.telefono}</span>
        <button onClick={()=>setConfirm(true)} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"1px solid rgba(255,84,112,0.3)", color:"#FF5470", fontSize:12, fontWeight:700, padding:"7px 12px", borderRadius:9, cursor:"pointer" }}><Trash2 size={14}/></button>
      </div>
      {confirm && (
        <div style={{ padding:"0 14px 14px" }}>
          <ConfirmInline mensaje={`¿Liberar el boleto #${num}? Quedará disponible de nuevo para venderse.`} onSi={onEliminar} onNo={()=>setConfirm(false)} />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ADMIN PANEL
   ============================================================ */
function Admin({ boletos, saveBoletos, setBoletosLocal, pendientes, savePendientes, setPendientesLocal, showToast, ganador, saveGanador, historial, saveHistorial, vendidosPorRifa, rifas, saveRifas, metodosPago, saveMetodosPago, siteConfig, saveSiteConfig, powerNumbers, savePowerNumbers, premiosPower, savePremiosPower, setPremiosPowerLocal, gastosRifas, saveGastosRifas, notifPermiso, pedirPermisoNotificaciones, onRefresh }) {
  const [avisoWhatsapp, setAvisoWhatsapp] = useState(null);
  const [emailLogin, setEmailLogin] = useState("");
  const [passLogin, setPassLogin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [checandoSesion, setCheckandoSesion] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUnlocked(!!user);
      setCheckandoSesion(false);
    });
    return () => unsub();
  }, []);

  const entrarAdmin = async () => {
    setLoginError("");
    setEntrando(true);
    try {
      await signInWithEmailAndPassword(auth, emailLogin.trim(), passLogin);
    } catch (e) {
      setLoginError("Correo o contraseña incorrectos");
    } finally {
      setEntrando(false);
    }
  };

  const salirAdmin = async () => {
    await signOut(auth);
    setEmailLogin(""); setPassLogin("");
  };

  const [numSorteo, setNumSorteo] = useState("");
  const [premioDsc, setPremioDsc] = useState("Scooter eléctrica");
  const [confirmando, setConfirmando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [editandoMetodo, setEditandoMetodo] = useState(null);
  const [editandoGanador, setEditandoGanador] = useState(null);
  const [tabAdmin, setTabAdmin] = useState("compras");
  const [refreshing, setRefreshing] = useState(false);
  const [formSitio, setFormSitio] = useState({ ...SITE_CONFIG_INICIAL, ...siteConfig });
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const comprimirLogo = (dataUrl, maxPx, cb) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL("image/png")); // PNG conserva la transparencia del logo
    };
    img.src = dataUrl;
  };
  const cargarLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoLogo(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      comprimirLogo(ev.target.result, 500, (compressed) => {
        setFormSitio(f => ({ ...f, logoUrl: compressed }));
        setSubiendoLogo(false);
      });
    };
    reader.readAsDataURL(file);
  };
  const [guardandoSitio, setGuardandoSitio] = useState(false);
  const [rifaSorteo, setRifaSorteo] = useState(rifas[0]?.id || null);
  const [confirmandoHuerfanos, setConfirmandoHuerfanos] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
    showToast("Datos actualizados ✓", "ok");
  };

  useEffect(() => { setFormSitio({ ...SITE_CONFIG_INICIAL, ...siteConfig }); }, [siteConfig]);
  useEffect(() => { if(!rifaSorteo && rifas[0]) setRifaSorteo(rifas[0].id); }, [rifas]);

  const tituloRifa = (rifaId) => rifas.find(r=>r.id===rifaId)?.titulo || "Rifa eliminada";

  // Listas globales agrupadas por rifa: [{rifaId, num, info}]
  const vendidosTodos = Object.entries(boletos||{}).flatMap(([rifaId, pool]) =>
    Object.entries(pool||{}).filter(([,v])=>v).map(([num,info])=>({rifaId,num,info}))
  );
  const pendientesActivos = pendientes.filter(p=>p.estado==="pendiente");
  const pendientesAprobados = pendientes.filter(p=>p.estado==="aprobado");
  const premiosPowerPendientes = (premiosPower||[]).filter(x=>!x.pagado);

  const rifasActivas = rifas.filter(r=>r.activa).slice().sort((a,b)=>new Date(a.fechaSorteo)-new Date(b.fechaSorteo));
  const statsPorRifa = rifasActivas.map(r=>{
    const vendidos = vendidosPorRifa(r.id);
    const disponibles = Math.max(0, r.totalBoletos - vendidos);
    const pct = r.totalBoletos>0 ? Math.round((vendidos/r.totalBoletos)*100) : 0;
    const comprasRifa = pendientesAprobados.filter(p=>p.rifaId===r.id);
    const recaudado = comprasRifa.reduce((s,p)=>s+(p.total||0),0);
    const proyeccion = r.totalBoletos * (r.precio||0);
    const dias = Math.ceil((new Date(r.fechaSorteo) - new Date()) / 86400000);
    const gasto = gastosRifas?.[r.id] || { promocion:0, inversion:0 };
    const totalGasto = (Number(gasto.promocion)||0) + (Number(gasto.inversion)||0);
    const gananciaNeta = recaudado - totalGasto;
    return { rifa:r, vendidos, disponibles, pct, numCompras:comprasRifa.length, recaudado, proyeccion, dias, gasto, totalGasto, gananciaNeta };
  });
  const totalRecaudadoActivas = statsPorRifa.reduce((s,x)=>s+x.recaudado,0);
  const totalVendidosActivas = statsPorRifa.reduce((s,x)=>s+x.vendidos,0);
  const totalGastoActivas = statsPorRifa.reduce((s,x)=>s+x.totalGasto,0);
  const totalGananciaActivas = totalRecaudadoActivas - totalGastoActivas;

  const [editandoGastoId, setEditandoGastoId] = useState(null);
  const [formGasto, setFormGasto] = useState({ promocion:"", inversion:"" });
  const empezarEditarGasto = (rifaId) => {
    const g = gastosRifas?.[rifaId] || { promocion:0, inversion:0 };
    setFormGasto({ promocion: String(g.promocion||0), inversion: String(g.inversion||0) });
    setEditandoGastoId(rifaId);
  };
  const guardarGasto = async (rifaId) => {
    const nuevo = {
      ...(gastosRifas||{}),
      [rifaId]: { promocion: Number(formGasto.promocion)||0, inversion: Number(formGasto.inversion)||0 }
    };
    const ok = await saveGastosRifas(nuevo);
    if (ok===false) showToast("Error al guardar. Intenta de nuevo.", "warn");
    else showToast("Gastos actualizados ✓", "ok");
    setEditandoGastoId(null);
  };

  const descargarRespaldo = () => {
    const respaldo = {
      fechaRespaldo: new Date().toISOString(),
      rifas, boletos, pendientes, ganador, historial,
      metodosPago, siteConfig, powerNumbers, premiosPower, gastosRifas
    };
    const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fecha = new Date().toISOString().slice(0,10);
    a.href = url; a.download = `respaldo-hiraldopower-${fecha}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Respaldo descargado ✓", "ok");
  };

  const aprobar = async (p) => {
    const ticketsRef = doc(db, "hiraldopower", "tickets_" + p.rifaId);
    const pendRef = doc(db, "hiraldopower", "pending");
    let asignados = [];
    let nextPoolFinal = null;
    let nextPendFinal = null;
    try {
      await runTransaction(db, async (tx) => {
        const ticketsSnap = await tx.get(ticketsRef);
        const pendSnap = await tx.get(pendRef);
        const rawPool = ticketsSnap.exists() ? ticketsSnap.data().value : null;
        const poolActual = rawPool ? (typeof rawPool === "string" ? JSON.parse(rawPool) : rawPool) : {};
        const pendActual = pendSnap.exists() ? (pendSnap.data().value || []) : [];
        const target = pendActual.find(x => x.id === p.id);
        if (!target || target.estado !== "pendiente") throw new Error("YA_PROCESADA");
        const disponibles = Object.keys(poolActual).filter(k => !poolActual[k]);
        if (disponibles.length < p.cantidad) throw new Error("SIN_DISPONIBLES");
        const pool = [...disponibles];
        const nextPool = { ...poolActual };
        asignados = [];
        for (let i = 0; i < p.cantidad && pool.length; i++) {
          const idx = Math.floor(Math.random() * pool.length);
          const num = pool.splice(idx, 1)[0];
          nextPool[num] = { nombre: p.nombre, telefono: p.telefono, fecha: p.fecha };
          asignados.push(num);
        }
        const nextPend = pendActual.map(x => x.id === p.id ? { ...x, estado: "aprobado", asignados } : x);
        tx.set(ticketsRef, { value: JSON.stringify(nextPool) });
        tx.set(pendRef, { value: nextPend });
        nextPoolFinal = nextPool;
        nextPendFinal = nextPend;
      });
    } catch (e) {
      if (e.message === "SIN_DISPONIBLES") showToast("No hay suficientes boletos disponibles en esta rifa", "warn");
      else if (e.message === "YA_PROCESADA") showToast("Esta compra ya fue procesada.", "warn");
      else { console.error("aprobar error:", e); showToast(`Error al asignar los boletos (${e.code || e.message || "desconocido"}). Intenta de nuevo.`, "warn"); }
      return;
    }
    // La escritura real y atómica ya quedó guardada arriba. Aquí SOLO se
    // refleja en la pantalla (React) — no se vuelve a escribir en Firebase,
    // porque volver a escribir con estos datos podría pisar la aprobación de
    // otra compra si se procesó casi al mismo tiempo.
    setBoletosLocal(b => ({ ...b, [p.rifaId]: nextPoolFinal }));
    setPendientesLocal(nextPendFinal);
    showToast(`${asignados.length} boletos asignados a ${p.nombre}: ${asignados.join(", ")}`, "ok");

    // ¿Alguno de los boletos asignados es un Número Power?
    const ganadoresPower = asignados.filter(num => (powerNumbers || []).includes(num));
    let ganoPower = false;
    if (ganadoresPower.length > 0) {
      ganoPower = true;
      const premioRef = doc(db, "hiraldopower", "premiosPower");
      let nextPremiosFinal = null;
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(premioRef);
          const actual = snap.exists() ? (snap.data().value || []) : [];
          const nuevos = ganadoresPower.map(num => ({
            id: "PW" + Date.now() + "-" + num,
            numero: num,
            nombre: p.nombre,
            telefono: p.telefono,
            rifaId: p.rifaId,
            rifaTitulo: tituloRifa(p.rifaId),
            fecha: new Date().toISOString(),
            pagado: false,
          }));
          nextPremiosFinal = [...nuevos, ...actual];
          tx.set(premioRef, { value: nextPremiosFinal });
        });
        setPremiosPowerLocal(nextPremiosFinal);
        ganadoresPower.forEach(num => {
          showToast(`⚡ ¡NÚMERO POWER! Boleto #${num} de ${p.nombre} gana RD$${PREMIO_POWER_MONTO.toLocaleString("es-DO")} al instante`, "power");
        });
      } catch (e) {
        console.error("registrar premio power error:", e);
        showToast("¡Salió un Número Power, pero hubo un error al registrarlo! Anótalo a mano.", "warn");
      }
    }

    setAvisoWhatsapp({
      nombre: p.nombre, telefono: p.telefono, asignados,
      rifaTitulo: tituloRifa(p.rifaId),
      ganadoresPower: ganoPower ? ganadoresPower : []
    });
  };

  const rechazar = async (p) => {
    const pendRef = doc(db, "hiraldopower", "pending");
    let nextPendFinal = null;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(pendRef);
        const pendActual = snap.exists() ? (snap.data().value || []) : [];
        nextPendFinal = pendActual.filter(x => x.id !== p.id);
        tx.set(pendRef, { value: nextPendFinal });
      });
    } catch (e) {
      console.error("rechazar error:", e);
      showToast("Error al rechazar. Intenta de nuevo.", "warn");
      return;
    }
    setPendientesLocal(nextPendFinal);
    showToast("Compra rechazada","warn");
  };

  const marcarPremioPagado = async (id) => {
    const nuevos = (premiosPower||[]).map(x => x.id===id ? {...x, pagado: !x.pagado} : x);
    const ok = await savePremiosPower(nuevos);
    if (ok===false) showToast("Error al actualizar. Intenta de nuevo.", "warn");
  };

  const eliminarPremioPower = async (id) => {
    const nuevos = (premiosPower||[]).filter(x => x.id!==id);
    const ok = await savePremiosPower(nuevos);
    if (ok===false) showToast("Error al eliminar. Intenta de nuevo.", "warn");
    else showToast("Registro eliminado ✓", "ok");
  };

  const [editandoPowerNumbers, setEditandoPowerNumbers] = useState(false);
  const [formPowerNumbers, setFormPowerNumbers] = useState(powerNumbers);
  useEffect(() => { setFormPowerNumbers(powerNumbers); }, [powerNumbers]);
  const guardarPowerNumbers = async () => {
    const limpios = formPowerNumbers.map(n => (n||"").trim()).filter(Boolean);
    if (limpios.length === 0) { showToast("Debes dejar al menos un número.", "warn"); return; }
    const ok = await savePowerNumbers(limpios);
    if (ok===false) showToast("Error al guardar. Intenta de nuevo.", "warn");
    else { showToast("Números Power actualizados ✓", "ok"); setEditandoPowerNumbers(false); }
  };

  const liberarBoleto = async (rifaId, num) => {
    const ticketsRef = doc(db, "hiraldopower", "tickets_" + rifaId);
    let nextPoolFinal = null;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ticketsRef);
        const raw = snap.exists() ? snap.data().value : null;
        const poolActual = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
        nextPoolFinal = { ...poolActual, [num]: null };
        tx.set(ticketsRef, { value: JSON.stringify(nextPoolFinal) });
      });
    } catch (e) {
      console.error("liberarBoleto error:", e);
      showToast("Error al borrar el boleto. Intenta de nuevo.", "warn");
      return;
    }
    setBoletosLocal(b => ({ ...b, [rifaId]: nextPoolFinal }));
    showToast(`Boleto #${num} liberado ✓`, "ok");
  };

  if (checandoSesion) return (
    <div style={{ maxWidth:480, margin:"0 auto", padding:"40px 20px", color:"#9AA1AC", fontSize:13 }}>
      Verificando sesión...
    </div>
  );

  if (!unlocked) return (
    <div style={{ maxWidth:480, margin:"0 auto", padding:"40px 20px" }}>
      <h2 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:22, marginBottom:6 }}>PANEL ADMIN</h2>
      <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:24 }}>Acceso solo para Hiraldo Power.</p>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        <input type="email" placeholder="Correo" value={emailLogin} onChange={e=>setEmailLogin(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&entrarAdmin()}
          style={{ background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", padding:"12px 14px", borderRadius:10, fontSize:14, outline:"none" }} />
        <input type="password" placeholder="Contraseña" value={passLogin} onChange={e=>setPassLogin(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&entrarAdmin()}
          style={{ background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", padding:"12px 14px", borderRadius:10, fontSize:14, outline:"none" }} />
        {loginError && <p style={{ color:"#f87171", fontSize:12, margin:0 }}>{loginError}</p>}
        <button onClick={entrarAdmin} disabled={entrando}
          style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"12px 18px", borderRadius:10, cursor:entrando?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, opacity:entrando?0.7:1 }}>
          <Lock size={14}/> {entrando ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </div>
  );

  const candidato = (() => {
    if(!numSorteo.trim()||!rifaSorteo) return null;
    const poolRifa = boletos[rifaSorteo]||{};
    const anchoClaves = Object.keys(poolRifa)[0]?.length || 3;
    const key=numSorteo.trim().padStart(anchoClaves,"0");
    const info=poolRifa[key];
    return info?{numero:key,...info}:{numero:key,noEncontrado:true};
  })();

  const confirmarGanador = async () => {
    if(!candidato||candidato.noEncontrado) return;
    const reg={numero:candidato.numero,nombre:candidato.nombre,telefono:candidato.telefono,rifaId:rifaSorteo,rifaTitulo:tituloRifa(rifaSorteo),premio:premioDsc.trim()||"Premio Hiraldo Power",fecha:new Date().toISOString()};
    await saveGanador(reg);
    await saveHistorial([{id:"H"+Date.now(),...reg},...historial]);
    showToast(`¡${candidato.nombre} es el ganador con el boleto #${candidato.numero}!`,"ok");
    setConfirmando(false); setNumSorteo("");
  };

  /* ---- GUARDAR RIFA ---- */
  const guardarRifa = async (form) => {
    const esNueva = !rifas.find(r=>r.id===form.id);
    let nuevas;
    if (!esNueva) {
      nuevas = rifas.map(r=>r.id===form.id?form:r);
      showToast("Rifa actualizada ✓","ok");
    } else {
      nuevas = [...rifas, form];
      showToast("Rifa creada ✓","ok");
    }
    const ok = await saveRifas(nuevas);
    if (ok === false) {
      showToast("Error al guardar en Firebase. La imagen puede ser demasiado grande.", "warn");
      return;
    }
    if (esNueva && !boletos[form.id]) {
      const w = String(Math.max(0,form.totalBoletos-1)).length;
      const poolNuevo = {}; for(let i=0;i<form.totalBoletos;i++) poolNuevo[String(i).padStart(w,"0")]=null;
      await saveBoletos({...boletos, [form.id]: poolNuevo});
    } else if (!esNueva) {
      // Si se aumentó el total de boletos, se agregan los números nuevos faltantes (sin tocar los ya vendidos)
      const poolActual = boletos[form.id] || {};
      const clavesExistentes = Object.keys(poolActual);
      const w = clavesExistentes[0]?.length || String(Math.max(0,form.totalBoletos-1)).length;
      const poolActualizado = {...poolActual};
      for (let i=0; i<form.totalBoletos; i++) {
        const key = String(i).padStart(w,"0");
        if (!(key in poolActualizado)) poolActualizado[key] = null;
      }
      if (Object.keys(poolActualizado).length !== Object.keys(poolActual).length) {
        await saveBoletos({...boletos, [form.id]: poolActualizado});
      }
    }
    setEditando(null);
  };

  const eliminarRifa = async (rifaId) => {
    await saveRifas(rifas.filter(x=>x.id!==rifaId));
    const nextBoletos = {...boletos}; delete nextBoletos[rifaId];
    await saveBoletos(nextBoletos);
    await savePendientes(pendientes.filter(p=>p.rifaId!==rifaId));
    showToast("Rifa y sus boletos eliminados","warn");
  };

  // IDs de boletos guardados que ya no corresponden a ninguna rifa existente (rifas borradas antes de esta actualización)
  const idsHuerfanos = Object.keys(boletos||{}).filter(rifaId => !rifas.find(r=>r.id===rifaId));
  const totalHuerfanos = idsHuerfanos.reduce((s,id)=>s+Object.keys(boletos[id]||{}).length,0);

  const limpiarHuerfanos = async () => {
    const next = {...boletos};
    idsHuerfanos.forEach(id => delete next[id]);
    const ok = await saveBoletos(next);
    if (ok===false) showToast("Error al limpiar. Intenta de nuevo.","warn");
    else showToast(`${totalHuerfanos} boletos huérfanos eliminados ✓`,"ok");
  };

  const TAB = ({id,label}) => (
    <button onClick={()=>setTabAdmin(id)} style={{ background:tabAdmin===id?"#C6FF3D":"#14171C", color:tabAdmin===id?"#0D0F12":"#9AA1AC", border:`1px solid ${tabAdmin===id?"#C6FF3D":"#232830"}`, fontWeight:700, fontSize:12, padding:"9px 18px", borderRadius:8, cursor:"pointer", letterSpacing:"0.4px" }}>{label}</button>
  );

  return (
    <div style={{ maxWidth:1600, margin:"0 auto" }} className="admin-main">
      {editando && <EditorRifa rifa={editando==="nueva"?null:editando} onGuardar={guardarRifa} onCancelar={()=>setEditando(null)} />}

      {avisoWhatsapp && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:20 }}>
          <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:16, padding:28, maxWidth:420, width:"100%" }}>
            <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:17, marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
              <Check size={18} style={{ color:"#C6FF3D" }}/> Compra aprobada
            </h3>
            <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:18, lineHeight:1.5 }}>
              Avisa a <strong style={{ color:"#F2F2EF" }}>{avisoWhatsapp.nombre}</strong> sus números con un solo toque:
            </p>
            <a href={`https://wa.me/${normalizarTelefono(avisoWhatsapp.telefono)}?text=${encodeURIComponent(mensajeAvisoNumeros(avisoWhatsapp, siteConfig))}`}
              target="_blank" rel="noopener noreferrer"
              onClick={()=>setAvisoWhatsapp(null)}
              style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"#25D366", color:"#0D0F12", fontWeight:800, fontSize:14, padding:"14px 20px", borderRadius:10, textDecoration:"none", marginBottom:10 }}>
              Enviar por WhatsApp
            </a>
            <button onClick={()=>setAvisoWhatsapp(null)} style={{ background:"transparent", border:"1px solid #333", color:"#9AA1AC", fontWeight:700, fontSize:13, padding:"12px 18px", borderRadius:10, cursor:"pointer", width:"100%" }}>
              Cerrar sin enviar
            </button>
          </div>
        </div>
      )}

      {/* TOPBAR */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"28px 40px 0", flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:24, letterSpacing:"0.5px" }}>PANEL ADMIN</h2>
          <p style={{ color:"#9AA1AC", fontSize:12, marginTop:2 }}>Hiraldo Power</p>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          {[["Vendidos",vendidosTodos.length,"#C6FF3D"],["Pendientes",pendientesActivos.length,"#FF6B35"],["Disponibles", Object.values(boletos||{}).reduce((s,pool)=>s+Object.values(pool||{}).filter(v=>!v).length,0),"#9AA1AC"],["Activas",rifas.filter(r=>r.activa).length,"#818cf8"]].map(([lbl,val,color])=>(
            <div key={lbl} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:10, padding:"10px 18px", textAlign:"center", minWidth:80 }}>
              <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:22, color, lineHeight:1 }}>{val}</div>
              <div style={{ fontSize:10, color:"#9AA1AC", textTransform:"uppercase", letterSpacing:"0.5px", marginTop:3 }}>{lbl}</div>
            </div>
          ))}
          {notifPermiso!=="granted" && notifPermiso!=="unsupported" && (
            <button onClick={pedirPermisoNotificaciones}
              style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"1px solid #818cf8", color:"#818cf8", fontWeight:700, fontSize:12, padding:"12px 18px", borderRadius:9, cursor:"pointer" }}>
              🔔 Activar notificaciones
            </button>
          )}
          <button onClick={handleRefresh} disabled={refreshing}
            style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"1px solid #C6FF3D", color:"#C6FF3D", fontWeight:700, fontSize:12, padding:"12px 18px", borderRadius:9, cursor:refreshing?"not-allowed":"pointer", opacity:refreshing?0.6:1 }}>
            {refreshing ? "Actualizando…" : "↻ Actualizar"}
          </button>
          <button onClick={salirAdmin}
            style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"1px solid #f87171", color:"#f87171", fontWeight:700, fontSize:12, padding:"12px 18px", borderRadius:9, cursor:"pointer" }}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {totalHuerfanos > 0 && tabAdmin!=="rifas" && (
        <button onClick={()=>setTabAdmin("rifas")} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.3)", color:"#f59e0b", fontSize:12, fontWeight:700, padding:"10px 14px", borderRadius:9, cursor:"pointer", margin:"16px 40px 0", textAlign:"left" }}>
          <AlertCircle size={15} style={{ flexShrink:0 }}/> {totalHuerfanos} boletos huérfanos de una rifa borrada. Haz clic para limpiarlos.
        </button>
      )}

      {/* LAYOUT DOS COLUMNAS */}
      <div className="admin-layout" style={{ display:"flex", gap:0, marginTop:24, minHeight:"calc(100vh - 200px)" }}>

        {/* SIDEBAR */}
        <aside className="admin-sidebar" style={{ width:220, minWidth:220, borderRight:"1px solid #232830", padding:"8px 12px", display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
          {[
            ["resumen", "📊 Contabilidad", null, null],
            ["compras", "📥 Compras", pendientesActivos.length > 0 ? pendientesActivos.length : null, pendientesActivos.length > 0 ? "#FF6B35" : null],
            ["rifas", "🎟️ Gestionar rifas", null, null],
            ["pagos", "💳 Métodos de pago", null, null],
            ["boletos", "📋 Boletos vendidos", vendidosTodos.length || null, null],
            ["ganadores", "🏆 Ganadores", historial.length || null, null],
            ["power", "⚡ Números Power", premiosPowerPendientes.length || null, premiosPowerPendientes.length > 0 ? "#f59e0b" : null],
            ["sorteo", "🎲 Sorteo en vivo", null, null],
            ["pagina", "✏️ Editar página", null, null],
            ["respaldo", "💾 Respaldo", null, null],
          ].map(([id, label, badge, badgeColor]) => (
            <button key={id} onClick={()=>setTabAdmin(id)} style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              background: tabAdmin===id ? "#C6FF3D" : "transparent",
              color: tabAdmin===id ? "#0D0F12" : "#9AA1AC",
              border: "none",
              fontWeight: tabAdmin===id ? 800 : 600,
              fontSize: 13,
              padding: "11px 14px",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "background .15s, color .15s",
            }}>
              <span>{label}</span>
              {badge !== null && (
                <span style={{ background: tabAdmin===id ? "rgba(0,0,0,0.18)" : (badgeColor||"#232830"), color: tabAdmin===id ? "#0D0F12" : "#F2F2EF", fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:999, minWidth:20, textAlign:"center" }}>{badge}</span>
              )}
            </button>
          ))}
        </aside>

        {/* CONTENIDO */}
        <main className="admin-content" style={{ flex:1, padding:"28px 36px", overflowX:"auto" }}>

      {/* ---- TAB: CONTABILIDAD ---- */}
      {tabAdmin==="resumen" && (
        <div>
          {rifasActivas.length===0 && <p style={{ color:"#9AA1AC", fontSize:13 }}>No hay rifas activas por ahora.</p>}

          {rifasActivas.length>0 && (
            <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
              <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:"14px 22px", minWidth:150 }}>
                <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:24, color:"#C6FF3D" }}>{fmtMoney(totalRecaudadoActivas)}</div>
                <div style={{ fontSize:11, color:"#9AA1AC", textTransform:"uppercase", marginTop:3 }}>Recaudado (rifas activas)</div>
              </div>
              <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:"14px 22px", minWidth:150 }}>
                <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:24, color:"#F2F2EF" }}>{totalVendidosActivas}</div>
                <div style={{ fontSize:11, color:"#9AA1AC", textTransform:"uppercase", marginTop:3 }}>Boletos vendidos</div>
              </div>
              <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:"14px 22px", minWidth:150 }}>
                <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:24, color:"#818cf8" }}>{rifasActivas.length}</div>
                <div style={{ fontSize:11, color:"#9AA1AC", textTransform:"uppercase", marginTop:3 }}>Rifas activas</div>
              </div>
              <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:"14px 22px", minWidth:150 }}>
                <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:24, color:"#f87171" }}>{fmtMoney(totalGastoActivas)}</div>
                <div style={{ fontSize:11, color:"#9AA1AC", textTransform:"uppercase", marginTop:3 }}>Promoción + inversión</div>
              </div>
              <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:"14px 22px", minWidth:150 }}>
                <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:24, color: totalGananciaActivas>=0?"#C6FF3D":"#f87171" }}>{fmtMoney(totalGananciaActivas)}</div>
                <div style={{ fontSize:11, color:"#9AA1AC", textTransform:"uppercase", marginTop:3 }}>Ganancia neta</div>
              </div>
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {statsPorRifa.map(({rifa:r, vendidos, disponibles, pct, numCompras, recaudado, proyeccion, dias, gasto, totalGasto, gananciaNeta}, idx)=>{
              const color = COLORES_RIFA[idx % COLORES_RIFA.length];
              return (
                <div key={r.id} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:14, padding:20, borderLeft:`3px solid ${color}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10, marginBottom:14 }}>
                    <div>
                      <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:16 }}>{r.titulo}</div>
                      <div style={{ fontSize:12, color:"#9AA1AC", marginTop:2 }}>
                        Sorteo {new Date(r.fechaSorteo).toLocaleDateString("es-DO")} · {dias>=0 ? `faltan ${dias} día${dias!==1?"s":""}` : "sorteo ya pasó"}
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:20, color }}>{fmtMoney(recaudado)}</div>
                      <div style={{ fontSize:10, color:"#9AA1AC", textTransform:"uppercase" }}>recaudado · {numCompras} compra{numCompras!==1?"s":""}</div>
                    </div>
                  </div>

                  <div style={{ height:8, background:"#0D0F12", borderRadius:99, overflow:"hidden", marginBottom:8 }}>
                    <div style={{ height:"100%", width:`${pct}%`, background:color, transition:"width .4s" }} />
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#9AA1AC", marginBottom:16 }}>
                    <span>{vendidos} de {r.totalBoletos} boletos vendidos ({pct}%)</span>
                    <span>{disponibles} disponibles</span>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10 }}>
                    <div style={{ background:"#0D0F12", borderRadius:9, padding:"10px 14px" }}>
                      <div style={{ fontSize:14, fontWeight:800 }}>{fmtMoney(r.precio)}</div>
                      <div style={{ fontSize:10, color:"#9AA1AC", textTransform:"uppercase" }}>por boleto</div>
                    </div>
                    <div style={{ background:"#0D0F12", borderRadius:9, padding:"10px 14px" }}>
                      <div style={{ fontSize:14, fontWeight:800 }}>{fmtMoney(proyeccion)}</div>
                      <div style={{ fontSize:10, color:"#9AA1AC", textTransform:"uppercase" }}>si se vende todo</div>
                    </div>
                    <div style={{ background:"#0D0F12", borderRadius:9, padding:"10px 14px" }}>
                      <div style={{ fontSize:14, fontWeight:800 }}>{(r.combos||[]).length}</div>
                      <div style={{ fontSize:10, color:"#9AA1AC", textTransform:"uppercase" }}>combos activos</div>
                    </div>
                  </div>

                  <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #232830" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: editandoGastoId===r.id ? 12 : 0 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"#9AA1AC", textTransform:"uppercase" }}>Promoción e inversión</span>
                      {editandoGastoId!==r.id && (
                        <button onClick={()=>empezarEditarGasto(r.id)} style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"1px solid #333", color:"#F2F2EF", fontWeight:700, fontSize:12, padding:"6px 12px", borderRadius:8, cursor:"pointer" }}>
                          <Pencil size={12}/> Editar
                        </button>
                      )}
                    </div>

                    {editandoGastoId!==r.id ? (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10 }}>
                        <div style={{ background:"#0D0F12", borderRadius:9, padding:"10px 14px" }}>
                          <div style={{ fontSize:14, fontWeight:800 }}>{fmtMoney(gasto.promocion||0)}</div>
                          <div style={{ fontSize:10, color:"#9AA1AC", textTransform:"uppercase" }}>promoción</div>
                        </div>
                        <div style={{ background:"#0D0F12", borderRadius:9, padding:"10px 14px" }}>
                          <div style={{ fontSize:14, fontWeight:800 }}>{fmtMoney(gasto.inversion||0)}</div>
                          <div style={{ fontSize:10, color:"#9AA1AC", textTransform:"uppercase" }}>inversión (premio, etc.)</div>
                        </div>
                        <div style={{ background:"#0D0F12", borderRadius:9, padding:"10px 14px" }}>
                          <div style={{ fontSize:14, fontWeight:800, color: gananciaNeta>=0?"#C6FF3D":"#f87171" }}>{fmtMoney(gananciaNeta)}</div>
                          <div style={{ fontSize:10, color:"#9AA1AC", textTransform:"uppercase" }}>ganancia neta</div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:12 }}>
                          <label>
                            <span style={{ display:"block", fontSize:11, color:"#9AA1AC", marginBottom:4 }}>Promoción (RD$)</span>
                            <input type="number" min="0" value={formGasto.promocion}
                              onChange={e=>setFormGasto(f=>({...f, promocion:e.target.value}))}
                              style={{ width:"100%", background:"#0D0F12", border:"1px solid #333", color:"#F2F2EF", padding:"10px 12px", borderRadius:8, fontSize:14, outline:"none" }} />
                          </label>
                          <label>
                            <span style={{ display:"block", fontSize:11, color:"#9AA1AC", marginBottom:4 }}>Inversión (RD$)</span>
                            <input type="number" min="0" value={formGasto.inversion}
                              onChange={e=>setFormGasto(f=>({...f, inversion:e.target.value}))}
                              style={{ width:"100%", background:"#0D0F12", border:"1px solid #333", color:"#F2F2EF", padding:"10px 12px", borderRadius:8, fontSize:14, outline:"none" }} />
                          </label>
                        </div>
                        <div style={{ display:"flex", gap:10 }}>
                          <button onClick={()=>guardarGasto(r.id)} style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"10px 18px", borderRadius:9, cursor:"pointer" }}>Guardar</button>
                          <button onClick={()=>setEditandoGastoId(null)} style={{ background:"transparent", border:"1px solid #333", color:"#9AA1AC", fontWeight:700, fontSize:13, padding:"10px 18px", borderRadius:9, cursor:"pointer" }}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- TAB: COMPRAS ---- */}
      {tabAdmin==="compras" && (
        <div>
          {pendientesActivos.length===0 && <p style={{ color:"#9AA1AC", fontSize:13 }}>No hay compras pendientes.</p>}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {pendientesActivos.map(p=>{
              const idx = rifas.findIndex(r=>r.id===p.rifaId);
              const color = COLORES_RIFA[idx>=0?idx%COLORES_RIFA.length:0];
              return (
              <div key={p.id} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:16, borderLeft:`3px solid ${color}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10, flexWrap:"wrap", gap:8 }}>
                  <div>
                    <strong>{p.nombre}</strong>
                    <div style={{ fontSize:12, color:"#9AA1AC", marginTop:2 }}>{p.telefono} · {p.metodo} · {fmtMoney(p.total)}</div>
                    <div style={{ fontSize:11, fontWeight:700, color, marginTop:4 }}>{p.rifaTitulo || tituloRifa(p.rifaId)}</div>
                  </div>
                  <div style={{ fontSize:11, color:"#9AA1AC" }}>{new Date(p.fecha).toLocaleString("es-DO")}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, background:"#0D0F12", border:"1px solid #232830", borderRadius:8, padding:"8px 12px", marginBottom:10 }}>
                  <Zap size={14} style={{ color:"#C6FF3D" }}/> {p.cantidad} boleto{p.cantidad>1?"s":""} por asignar al azar
                </div>
                {p.captura && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>📸 CAPTURA DE PAGO</div>
                    <img src={p.captura} alt="Captura" style={{ width:"100%", maxHeight:200, objectFit:"contain", borderRadius:8, border:"1px solid #232830", background:"#0D0F12" }} />
                  </div>
                )}
                {!p.captura && p.metodo && !p.metodo.toLowerCase().includes("efectivo") && (
                  <div style={{ display:"flex", gap:8, alignItems:"center", background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:8, padding:"8px 12px", marginBottom:10, fontSize:12, color:"#f59e0b" }}>
                    <AlertCircle size={14}/> Sin captura adjunta
                  </div>
                )}
                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                  <button onClick={()=>rechazar(p)} style={{ background:"none", border:"1px solid rgba(255,84,112,0.3)", color:"#FF5470", fontWeight:700, fontSize:13, padding:"10px 16px", borderRadius:10, cursor:"pointer" }}>Rechazar</button>
                  <button onClick={()=>aprobar(p)} style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"10px 16px", borderRadius:10, cursor:"pointer" }}>✓ Aprobar y asignar</button>
                </div>
              </div>
            );})}
          </div>
        </div>
      )}

      {/* ---- TAB: GESTIONAR RIFAS ---- */}
      {tabAdmin==="rifas" && (
        <div>
          {totalHuerfanos > 0 && (
            <div style={{ background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:12, padding:16, marginBottom:18 }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <AlertCircle size={18} style={{ color:"#f59e0b", flexShrink:0, marginTop:2 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#f59e0b" }}>Boletos huérfanos detectados</div>
                  <div style={{ fontSize:12, color:"#9AA1AC", marginTop:4 }}>
                    Hay {totalHuerfanos} boleto{totalHuerfanos!==1?"s":""} guardado{totalHuerfanos!==1?"s":""} de rifa{idsHuerfanos.length!==1?"s":""} que ya no existe{idsHuerfanos.length!==1?"n":""} (se borraron antes de esta actualización). No afectan a tus rifas actuales, pero puedes limpiarlos.
                  </div>
                  {!confirmandoHuerfanos ? (
                    <button onClick={()=>setConfirmandoHuerfanos(true)} style={{ marginTop:10, background:"none", border:"1px solid rgba(245,158,11,0.4)", color:"#f59e0b", fontWeight:700, fontSize:12, padding:"8px 14px", borderRadius:8, cursor:"pointer" }}>
                      <Trash2 size={13} style={{ verticalAlign:-2, marginRight:6 }}/> Limpiar boletos huérfanos
                    </button>
                  ) : (
                    <div style={{ marginTop:10 }}>
                      <ConfirmInline mensaje={`¿Eliminar los ${totalHuerfanos} boletos huérfanos? Esta acción no se puede deshacer.`}
                        onSi={async()=>{ await limpiarHuerfanos(); setConfirmandoHuerfanos(false); }}
                        onNo={()=>setConfirmandoHuerfanos(false)} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:18 }}>
            <button onClick={()=>setEditando("nueva")} style={{ display:"flex", alignItems:"center", gap:8, background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"11px 18px", borderRadius:10, cursor:"pointer" }}>
              <Plus size={16}/> Nueva rifa
            </button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {rifas.map(r=>(
              <RifaRow key={r.id} r={r}
                onEditar={()=>setEditando(r)}
                onEliminar={()=>eliminarRifa(r.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- TAB: MÉTODOS DE PAGO ---- */}
      {tabAdmin==="pagos" && (
        <div>
          {editandoMetodo && (
            <EditorMetodoPago
              metodo={editandoMetodo==="nuevo"?null:editandoMetodo}
              onGuardar={async(m)=>{
                let nuevos;
                if(metodosPago.find(x=>x.id===m.id)) nuevos=metodosPago.map(x=>x.id===m.id?m:x);
                else nuevos=[...metodosPago,m];
                await saveMetodosPago(nuevos); setEditandoMetodo(null); showToast("Método guardado ✓","ok");
              }}
              onCancelar={()=>setEditandoMetodo(null)}
            />
          )}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div style={{ fontSize:13, color:"#9AA1AC" }}>Los clientes ven estos métodos al comprar un boleto.</div>
            <button onClick={()=>setEditandoMetodo("nuevo")} style={{ display:"flex", alignItems:"center", gap:8, background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"11px 18px", borderRadius:10, cursor:"pointer" }}>
              <Plus size={16}/> Agregar método
            </button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {(metodosPago||[]).map(m=>(
              <MetodoPagoRow key={m.id} m={m}
                onEditar={()=>setEditandoMetodo(m)}
                onEliminar={async()=>{ await saveMetodosPago(metodosPago.filter(x=>x.id!==m.id)); showToast("Método eliminado","warn"); }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- TAB: BOLETOS ---- */}
      {tabAdmin==="boletos" && (
        <div>
          {vendidosTodos.length>0 && (
            <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:18 }}>{vendidosTodos.length} boleto{vendidosTodos.length!==1?"s":""} vendido{vendidosTodos.length!==1?"s":""} en total. Toca la papelera para liberar un boleto (vuelve a quedar disponible para la venta).</p>
          )}
          {vendidosTodos.length===0 && <p style={{ color:"#9AA1AC", fontSize:13, padding:16 }}>Aún no hay boletos vendidos.</p>}
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            {Object.entries(
              vendidosTodos.reduce((acc,{rifaId,num,info})=>{ (acc[rifaId]=acc[rifaId]||[]).push([num,info]); return acc; },{})
            ).map(([rifaId,items])=>{
              const idx = rifas.findIndex(r=>r.id===rifaId);
              const color = COLORES_RIFA[idx>=0?idx%COLORES_RIFA.length:0];
              return (
                <div key={rifaId}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <span style={{ width:10, height:10, borderRadius:999, background:color, flexShrink:0 }} />
                    <span style={{ fontFamily:"'Arial Black',sans-serif", fontSize:13, color }}>{tituloRifa(rifaId)}</span>
                    <span style={{ fontSize:11, color:"#9AA1AC" }}>· {items.length} boleto{items.length!==1?"s":""}</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:1, background:"#232830", borderRadius:10, overflow:"hidden", borderLeft:`3px solid ${color}` }}>
                    {items.map(([num,info])=>(
                      <BoletoVendidoRow key={num} num={num} info={info} onEliminar={()=>liberarBoleto(rifaId,num)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- TAB: GANADORES ---- */}
      {tabAdmin==="ganadores" && (
        <div>
          {editandoGanador && (
            <EditorGanador
              ganador={editandoGanador==="nuevo"?null:editandoGanador}
              onGuardar={async(g)=>{
                const esEdicion = historial.find(x=>x.id===g.id);
                const nuevos = esEdicion
                  ? historial.map(x=>x.id===g.id?g:x)
                  : [{...g, id:"H"+Date.now()}, ...historial];
                const ok = await saveHistorial(nuevos);
                if (ok===false) showToast("Error al guardar el ganador. Intenta de nuevo.","warn");
                else showToast(esEdicion?"Ganador actualizado ✓":"Ganador agregado ✓","ok");
                setEditandoGanador(null);
              }}
              onCancelar={()=>setEditandoGanador(null)}
            />
          )}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div style={{ fontSize:13, color:"#9AA1AC" }}>{historial.length} ganador{historial.length!==1?"es":""} en el historial público.</div>
            <button onClick={()=>setEditandoGanador("nuevo")} style={{ display:"flex", alignItems:"center", gap:8, background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"11px 18px", borderRadius:10, cursor:"pointer" }}>
              <Plus size={16}/> Agregar ganador
            </button>
          </div>
          {historial.length===0 && (
            <div style={{ display:"flex", gap:12, background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:16, fontSize:13, color:"#9AA1AC" }}>
              <AlertCircle size={18} style={{ flexShrink:0 }}/> No hay ganadores registrados todavía.
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {historial.map(h=>(
              <GanadorRow key={h.id} h={h}
                onEditar={()=>setEditandoGanador(h)}
                onEliminar={async()=>{ await saveHistorial(historial.filter(x=>x.id!==h.id)); showToast("Ganador eliminado","warn"); }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- TAB: NÚMEROS POWER ---- */}
      {tabAdmin==="power" && (
        <div>
          <div style={{ display:"flex", gap:12, background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:12, padding:16, fontSize:13, color:"#f59e0b", marginBottom:20 }}>
            <Sparkles size={18} style={{ flexShrink:0 }}/>
            <div>
              Cuando un cliente compre un boleto y el sistema le asigne al azar uno de tus Números Power, aparecerá una notificación aquí y en la parte superior de la pantalla. Cada uno paga RD${PREMIO_POWER_MONTO.toLocaleString("es-DO")} instantáneo. Estos números no se muestran en ninguna parte pública de la página.
            </div>
          </div>

          {/* Editor de los 5 números */}
          <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:14, padding:22, marginBottom:24, maxWidth:640 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: editandoPowerNumbers ? 16 : 0 }}>
              <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, display:"flex", alignItems:"center", gap:8 }}>
                <Zap size={17} style={{ color:"#f59e0b" }}/> Tus 5 Números Power
              </h3>
              {!editandoPowerNumbers && (
                <button onClick={()=>setEditandoPowerNumbers(true)} style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"1px solid #333", color:"#F2F2EF", fontWeight:700, fontSize:12, padding:"8px 14px", borderRadius:8, cursor:"pointer" }}>
                  <Pencil size={13}/> Editar
                </button>
              )}
            </div>

            {!editandoPowerNumbers ? (
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                {(powerNumbers||[]).map((n,i)=>(
                  <span key={i} style={{ fontFamily:"'Arial Black',sans-serif", fontSize:18, background:"#0D0F12", border:"1px solid #f59e0b", color:"#f59e0b", padding:"8px 16px", borderRadius:8 }}>#{n}</span>
                ))}
              </div>
            ) : (
              <div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
                  {formPowerNumbers.map((n,i)=>(
                    <input key={i} value={n} maxLength={4}
                      onChange={e=>{
                        const v = e.target.value.replace(/\D/g,"");
                        setFormPowerNumbers(fp => fp.map((x,idx)=>idx===i?v:x));
                      }}
                      style={{ width:70, textAlign:"center", background:"#0D0F12", border:"1px solid #333", color:"#F2F2EF", fontFamily:"'Arial Black',sans-serif", fontSize:16, padding:"10px 0", borderRadius:8 }}
                    />
                  ))}
                  <button onClick={()=>setFormPowerNumbers(fp=>[...fp,""])} style={{ background:"#232830", border:"1px dashed #444", color:"#9AA1AC", borderRadius:8, width:44, cursor:"pointer" }}>+</button>
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={guardarPowerNumbers} style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"10px 18px", borderRadius:9, cursor:"pointer" }}>Guardar</button>
                  <button onClick={()=>{ setFormPowerNumbers(powerNumbers); setEditandoPowerNumbers(false); }} style={{ background:"transparent", border:"1px solid #333", color:"#9AA1AC", fontWeight:700, fontSize:13, padding:"10px 18px", borderRadius:9, cursor:"pointer" }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* Ganadores de Números Power */}
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, marginBottom:14 }}>Ganadores de Números Power</h3>
          {(premiosPower||[]).length===0 && (
            <div style={{ display:"flex", gap:12, background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:16, fontSize:13, color:"#9AA1AC" }}>
              <AlertCircle size={18} style={{ flexShrink:0 }}/> Todavía no ha salido ningún Número Power.
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {(premiosPower||[]).map(pw=>(
              <div key={pw.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:14, background:"#14171C", border:`1px solid ${pw.pagado?"#232830":"#f59e0b"}`, borderRadius:12, padding:"14px 18px", flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                  <span style={{ fontFamily:"'Arial Black',sans-serif", fontSize:16, color:"#f59e0b" }}>#{pw.numero}</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{pw.nombre} <span style={{ color:"#9AA1AC", fontWeight:400 }}>· {pw.telefono}</span></div>
                    <div style={{ fontSize:11, color:"#9AA1AC", marginTop:2 }}>{pw.rifaTitulo} · {new Date(pw.fecha).toLocaleString("es-DO")}</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>marcarPremioPagado(pw.id)} style={{ display:"flex", alignItems:"center", gap:6, background: pw.pagado?"#232830":"#C6FF3D", color: pw.pagado?"#9AA1AC":"#0D0F12", border:"none", fontWeight:800, fontSize:12, padding:"9px 14px", borderRadius:8, cursor:"pointer" }}>
                    {pw.pagado ? <>✓ Pagado</> : <>Marcar como pagado</>}
                  </button>
                  <button onClick={()=>{ if(window.confirm(`¿Eliminar el registro del boleto #${pw.numero} (${pw.nombre})?`)) eliminarPremioPower(pw.id); }} title="Eliminar registro"
                    style={{ display:"flex", alignItems:"center", justifyContent:"center", background:"#232830", border:"1px solid #f87171", color:"#f87171", padding:"9px 11px", borderRadius:8, cursor:"pointer" }}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- TAB: SORTEO ---- */}
      {tabAdmin==="sorteo" && (
        <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:14, padding:28, maxWidth:700 }}>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
            <Award size={17} style={{ color:"#C6FF3D" }}/> Sorteo en vivo
          </h3>
          <label style={{ display:"block", marginBottom:18 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Rifa a sortear</span>
            <select value={rifaSorteo||""} onChange={e=>{setRifaSorteo(e.target.value);setNumSorteo("");setConfirmando(false);}}
              style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }}>
              {rifas.length===0 && <option value="">No hay rifas creadas</option>}
              {rifas.map(r=><option key={r.id} value={r.id}>{r.titulo}</option>)}
            </select>
          </label>
          {ganador ? (
            <div style={{ display:"flex", alignItems:"center", gap:16, background:"rgba(198,255,61,0.07)", border:"1px solid rgba(198,255,61,0.3)", borderRadius:12, padding:18 }}>
              <Trophy size={28} style={{ color:"#C6FF3D" }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:22, color:"#C6FF3D" }}>Boleto #{ganador.numero}</div>
                <div style={{ fontWeight:700, fontSize:15, marginTop:2 }}>{ganador.nombre}</div>
                <div style={{ fontSize:12, color:"#9AA1AC", marginTop:2 }}>{ganador.telefono} · {new Date(ganador.fecha).toLocaleString("es-DO")}</div>
                {ganador.rifaTitulo && <div style={{ fontSize:12, color:"#C6FF3D", marginTop:2 }}>{ganador.rifaTitulo}</div>}
              </div>
              <button onClick={()=>saveGanador(null)} style={{ background:"none", border:"1px solid rgba(255,84,112,0.3)", color:"#FF5470", fontWeight:700, fontSize:13, padding:"10px 16px", borderRadius:10, cursor:"pointer" }}>Reiniciar</button>
            </div>
          ) : (
            <>
              <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:16 }}>Cuando saques la bolita ganadora, escribe el número para identificar al ganador. Hay {rifaSorteo ? vendidosPorRifa(rifaSorteo) : 0} boletos vendidos en esta rifa.</p>
              <label style={{ display:"block", marginBottom:14 }}>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Premio de esta rifa</span>
                <input value={premioDsc} onChange={e=>setPremioDsc(e.target.value)} placeholder="Ej: Scooter eléctrica"
                  style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
              </label>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                <input placeholder="Número de la tómbola, ej: 047" value={numSorteo} disabled={!rifaSorteo}
                  onChange={e=>{setNumSorteo(e.target.value);setConfirmando(false);}}
                  onKeyDown={e=>e.key==="Enter"&&candidato&&!candidato.noEncontrado&&setConfirmando(true)}
                  style={{ flex:1, background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"12px 14px", borderRadius:10, fontSize:14, outline:"none" }} />
                <button disabled={!candidato||candidato?.noEncontrado} onClick={()=>setConfirmando(true)}
                  style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"12px 18px", borderRadius:10, cursor:"pointer", opacity:(!candidato||candidato?.noEncontrado)?0.4:1 }}>
                  Buscar
                </button>
              </div>
              {candidato?.noEncontrado && (
                <div style={{ display:"flex", gap:12, background:"#0D0F12", border:"1px solid #232830", borderRadius:10, padding:14, fontSize:13, color:"#9AA1AC" }}>
                  <AlertCircle size={18} style={{ flexShrink:0 }}/> El boleto #{candidato.numero} no fue vendido en esta rifa.
                </div>
              )}
              {candidato&&!candidato.noEncontrado&&confirmando && (
                <div style={{ background:"#0D0F12", border:"1px solid #232830", borderRadius:10, padding:16, fontSize:13 }}>
                  <div>¿Confirmar a <strong>{candidato.nombre}</strong> ({candidato.telefono}) como ganador con el boleto <strong>#{candidato.numero}</strong>?</div>
                  <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
                    <button onClick={()=>setConfirmando(false)} style={{ background:"none", border:"1px solid #232830", color:"#F2F2EF", fontWeight:700, fontSize:13, padding:"10px 16px", borderRadius:10, cursor:"pointer" }}>Cancelar</button>
                    <button onClick={confirmarGanador} style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"10px 16px", borderRadius:10, cursor:"pointer" }}>✓ Confirmar ganador</button>
                  </div>
                </div>
              )}
            </>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(255,107,53,0.08)", border:"1px solid rgba(255,107,53,0.25)", color:"#FF6B35", padding:"14px 16px", borderRadius:10, fontSize:13, marginTop:24 }}>
            <Trophy size={16}/> Solo entran a la tómbola los boletos vendidos y aprobados de la rifa seleccionada.
          </div>
        </div>
      )}

      {/* ---- TAB: PÁGINA ---- */}
      {tabAdmin==="pagina" && (
        <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:14, padding:28, maxWidth:900 }}>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
            <Pencil size={16} style={{ color:"#C6FF3D" }}/> Editar página principal
          </h3>
          <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:20 }}>Cambia los textos y el color que ven los clientes en el inicio. Se aplica en toda la página al guardar.</p>

          <label style={{ display:"block", marginBottom:14 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Logo (header y footer)</span>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:64, height:64, borderRadius:10, background:"#0D0F12", border:"1px solid #232830", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                {formSitio.logoUrl
                  ? <img src={formSitio.logoUrl} alt="Logo" style={{ maxWidth:"100%", maxHeight:"100%" }} />
                  : <Zap size={22} style={{ color: formSitio.colorAcento }} />}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <label style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#232830", color:"#F2F2EF", fontSize:12, fontWeight:700, padding:"9px 14px", borderRadius:8, cursor: subiendoLogo?"not-allowed":"pointer", opacity: subiendoLogo?0.6:1, width:"fit-content" }}>
                  <ImagePlus size={14}/> {subiendoLogo ? "Procesando…" : (formSitio.logoUrl ? "Cambiar logo" : "Subir logo")}
                  <input type="file" accept="image/*" disabled={subiendoLogo} onChange={cargarLogo} style={{ display:"none" }} />
                </label>
                {formSitio.logoUrl && (
                  <button onClick={()=>setFormSitio(f=>({...f,logoUrl:""}))} style={{ background:"none", border:"none", color:"#FF5470", fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"left", padding:0 }}>
                    Quitar logo (usar ícono de rayo)
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize:11, color:"#5a6170", marginTop:8 }}>Usa una imagen con fondo transparente (PNG) para que se vea bien en el header oscuro.</p>
          </label>

          <label style={{ display:"block", marginBottom:14 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Nombre de la marca (header y footer)</span>
            <input value={formSitio.marca} onChange={e=>setFormSitio(f=>({...f,marca:e.target.value}))} placeholder="Ej: HIRALDO POWER"
              style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
          </label>

          <label style={{ display:"block", marginBottom:14 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Etiqueta pequeña arriba del título (hero)</span>
            <input value={formSitio.badgeHero} onChange={e=>setFormSitio(f=>({...f,badgeHero:e.target.value}))} placeholder="Ej: HIRALDO POWER · RIFAS EN VIVO"
              style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
          </label>

          <div style={{ display:"flex", gap:12, marginBottom:14 }}>
            <label style={{ display:"block", flex:1 }}>
              <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Título — parte 1 (blanco)</span>
              <input value={formSitio.tituloHero1} onChange={e=>setFormSitio(f=>({...f,tituloHero1:e.target.value}))} placeholder="Ej: CATÁLOGO"
                style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
            </label>
            <label style={{ display:"block", flex:1 }}>
              <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Título — parte 2 (degradado)</span>
              <input value={formSitio.tituloHero2} onChange={e=>setFormSitio(f=>({...f,tituloHero2:e.target.value}))} placeholder="Ej: DE RIFAS"
                style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
            </label>
          </div>

          <label style={{ display:"block", marginBottom:14 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Subtítulo (debajo del título grande)</span>
            <input value={formSitio.subtituloHero} onChange={e=>setFormSitio(f=>({...f,subtituloHero:e.target.value}))} placeholder="Ej: Selecciona tu artículo soñado y asegura tu oportunidad."
              style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
          </label>

          <label style={{ display:"block", marginBottom:14 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Texto del pie de página (footer)</span>
            <input value={formSitio.footerTexto} onChange={e=>setFormSitio(f=>({...f,footerTexto:e.target.value}))} placeholder="Ej: Rifas en vivo y verificables"
              style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
          </label>

          <label style={{ display:"block", marginBottom:20 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Color de acento (rayo, barra de progreso, botones)</span>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input type="color" value={formSitio.colorAcento} onChange={e=>setFormSitio(f=>({...f,colorAcento:e.target.value}))}
                style={{ width:48, height:38, padding:0, border:"1px solid #232830", borderRadius:8, background:"#0D0F12", cursor:"pointer" }} />
              <input value={formSitio.colorAcento} onChange={e=>setFormSitio(f=>({...f,colorAcento:e.target.value}))} placeholder="#C6FF3D"
                style={{ flex:1, background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
            </div>
          </label>

          <label style={{ display:"block", marginBottom:20 }}>
            <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Color del título — parte 1 (Ej: "JUEGA PARTICIPAS &")</span>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input type="color" value={formSitio.colorTitulo1 || "#F2F2EF"} onChange={e=>setFormSitio(f=>({...f,colorTitulo1:e.target.value}))}
                style={{ width:48, height:38, padding:0, border:"1px solid #232830", borderRadius:8, background:"#0D0F12", cursor:"pointer" }} />
              <input value={formSitio.colorTitulo1 || "#F2F2EF"} onChange={e=>setFormSitio(f=>({...f,colorTitulo1:e.target.value}))} placeholder="#F2F2EF"
                style={{ flex:1, background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
            </div>
          </label>

          <div style={{ borderTop:"1px solid #232830", paddingTop:20, marginTop:6, marginBottom:20 }}>
            <h4 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:14, marginBottom:4, display:"flex", alignItems:"center", gap:8 }}>
              <Zap size={15} style={{ color:"#25D366" }}/> Mensaje de WhatsApp al aprobar una compra
            </h4>
            <p style={{ color:"#9AA1AC", fontSize:12, marginBottom:14, lineHeight:1.5 }}>
              Este es el mensaje que se abre listo para enviar cuando apruebas una compra. Usa estos marcadores donde quieras dentro del texto — se reemplazan automáticamente: <code style={{background:"#0D0F12",padding:"1px 5px",borderRadius:4}}>{"{nombre}"}</code> <code style={{background:"#0D0F12",padding:"1px 5px",borderRadius:4}}>{"{rifa}"}</code> <code style={{background:"#0D0F12",padding:"1px 5px",borderRadius:4}}>{"{numeros}"}</code> <code style={{background:"#0D0F12",padding:"1px 5px",borderRadius:4}}>{"{lineaPower}"}</code> <code style={{background:"#0D0F12",padding:"1px 5px",borderRadius:4}}>{"{instagram}"}</code> <code style={{background:"#0D0F12",padding:"1px 5px",borderRadius:4}}>{"{facebook}"}</code>
            </p>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14, marginBottom:14 }}>
              <label>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Instagram</span>
                <input value={formSitio.instagram || ""} onChange={e=>setFormSitio(f=>({...f,instagram:e.target.value}))} placeholder="@tuusuario"
                  style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
              </label>
              <label>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Facebook</span>
                <input value={formSitio.facebook || ""} onChange={e=>setFormSitio(f=>({...f,facebook:e.target.value}))} placeholder="Nombre de tu página"
                  style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
              </label>
            </div>

            <label style={{ display:"block", marginBottom:8 }}>
              <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Texto del mensaje</span>
              <textarea value={formSitio.mensajeWhatsapp || ""} onChange={e=>setFormSitio(f=>({...f,mensajeWhatsapp:e.target.value}))} rows={10}
                style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:13, outline:"none", fontFamily:"inherit", lineHeight:1.5, resize:"vertical" }} />
            </label>
            <button onClick={()=>setFormSitio(f=>({...f, mensajeWhatsapp: MENSAJE_WHATSAPP_INICIAL}))}
              style={{ background:"none", border:"1px solid #232830", color:"#9AA1AC", fontWeight:700, fontSize:12, padding:"9px 14px", borderRadius:8, cursor:"pointer" }}>
              Restaurar mensaje por defecto
            </button>
          </div>

          <div style={{ borderTop:"1px solid #232830", paddingTop:20, marginBottom:20 }}>
            <h4 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:14, marginBottom:4, display:"flex", alignItems:"center", gap:8 }}>
              <Lock size={14} style={{ color:"#f59e0b" }}/> Código para pagos en efectivo
            </h4>
            <p style={{ color:"#9AA1AC", fontSize:12, marginBottom:12, lineHeight:1.5 }}>
              El cliente debe escribir este código para poder elegir "efectivo" como método de pago. Compártelo solo con quien tú autorices comprar en efectivo (o úsalo tú mismo si registras una venta en persona).
            </p>
            <input value={formSitio.codigoEfectivo || ""} onChange={e=>setFormSitio(f=>({...f,codigoEfectivo:e.target.value}))} placeholder="Ej: 4821"
              style={{ width:"100%", maxWidth:220, background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={async()=>{
                setGuardandoSitio(true);
                const ok = await saveSiteConfig(formSitio);
                setGuardandoSitio(false);
                if (ok===false) showToast("Error al guardar los cambios. Intenta de nuevo.","warn");
                else showToast("Página actualizada ✓","ok");
              }} disabled={guardandoSitio}
              style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"12px 20px", borderRadius:10, cursor:guardandoSitio?"not-allowed":"pointer", opacity:guardandoSitio?0.6:1, display:"flex", alignItems:"center", gap:6 }}>
              <Check size={15}/> {guardandoSitio?"Guardando…":"Guardar cambios"}
            </button>
            <button onClick={()=>{setFormSitio({...SITE_CONFIG_INICIAL}); showToast("Valores por defecto cargados (sin guardar todavía)","ok");}}
              style={{ background:"none", border:"1px solid #232830", color:"#9AA1AC", fontWeight:700, fontSize:13, padding:"12px 18px", borderRadius:10, cursor:"pointer" }}>
              Restaurar valores originales
            </button>
          </div>
        </div>
      )}

      {/* ---- TAB: RESPALDO ---- */}
      {tabAdmin==="respaldo" && (
        <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:14, padding:28, maxWidth:700 }}>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
            <Save size={16} style={{ color:"#C6FF3D" }}/> Respaldo de tus datos
          </h3>
          <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:20, lineHeight:1.5 }}>
            Descarga una copia completa de tu información (rifas, boletos, compras, historial de ganadores, Números Power, métodos de pago y configuración del sitio) en un archivo. Guárdalo en tu computadora o en Google Drive. Te recomendamos hacer esto cada semana, o antes de cualquier cambio grande en el sitio.
          </p>
          <button onClick={descargarRespaldo} style={{ display:"flex", alignItems:"center", gap:8, background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:14, padding:"14px 22px", borderRadius:10, cursor:"pointer" }}>
            <Save size={16}/> Descargar respaldo (.json)
          </button>
          <p style={{ color:"#9AA1AC", fontSize:12, marginTop:16 }}>
            Este archivo es solo para guardar como copia de seguridad — no lo compartas públicamente, ya que incluye nombres y teléfonos de compradores.
          </p>
        </div>
      )}
        </main>
      </div>
    </div>
  );
}
