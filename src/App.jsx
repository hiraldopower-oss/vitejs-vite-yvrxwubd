import { useState, useEffect, useRef } from "react";
import { Zap, Trophy, Clock, ChevronRight, ShieldCheck, Lock, AlertCircle, PartyPopper, Award, Pencil, Trash2, Plus, ImagePlus, Check, X } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDhR3k-9T_QkJmhZQCrjckPsy0z2vNTlgo",
  authDomain: "hiraldo-power.firebaseapp.com",
  projectId: "hiraldo-power",
  storageBucket: "hiraldo-power.firebasestorage.app",
  messagingSenderId: "435721767032",
  appId: "1:435721767032:web:9032ec6acac0a269e6058d"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

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

const ADMIN_PIN = "1818";

const CATEGORIAS = ["motos", "autos", "efectivo", "tech", "otro"];

const METODOS_PAGO_INICIALES = [
  { id: "mp-1", tipo: "banco", nombre: "Banco Popular", titular: "Hiraldo Power", cuenta: "809-555-0118", activo: true },
  { id: "mp-2", tipo: "efectivo", nombre: "Efectivo (en persona)", titular: "", cuenta: "", activo: true },
];

function fmtMoney(n) { return "RD$" + Number(n).toLocaleString("es-DO"); }

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
  const p = Math.min(100, Math.round((vendidos/total)*100));
  const color = p>=90?"#FF6B35":p>=60?"#f59e0b":"#C6FF3D";
  return (
    <div>
      <div style={{ height: 6, background: "#232830", borderRadius: 999, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${p}%`, background: color, borderRadius: 999, transition: "width .4s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9AA1AC", fontWeight: 700 }}>
        <span>PROGRESO: <strong style={{ color: "#F2F2EF" }}>{p}%</strong></span>
        {p>=100 && <span style={{ color: "#FF6B35" }}>¡AGOTADO!</span>}
      </div>
    </div>
  );
}

/* ---- Rifa Card ---- */
function RifaCard({ rifa, vendidosCount, onJugar }) {
  const agotada = !rifa.activa || vendidosCount >= rifa.totalBoletos;
  return (
    <div style={{ background: "#14171C", border: `1px solid ${rifa.destacada ? "rgba(198,255,61,0.3)" : "#232830"}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", width: "100%" }}>
      <div style={{ paddingBottom: "62.5%", background: "#1a1d23", position: "relative", overflow: "hidden" }}>
        {rifa.imagen
          ? <img src={rifa.imagen} alt={rifa.titulo} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}><Trophy size={48} style={{ opacity: 0.15, color: "#9AA1AC" }} /></div>
        }
        {agotada && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ fontFamily: "'Arial Black',sans-serif", fontSize: 28, color: "#FF5470", border: "3px solid #FF5470", padding: "4px 14px", borderRadius: 6, transform: "rotate(-8deg)", letterSpacing: 2 }}>AGOTADO</div>
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
            ? <button disabled style={{ border: "1px solid #FF5470", background: "#1a1d23", color: "#FF5470", fontSize: 11, fontWeight: 800, padding: "8px 14px", borderRadius: 8, opacity: 0.7, cursor: "not-allowed" }}>AGOTADO</button>
            : <button onClick={onJugar} style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid #C6FF3D", background: "none", color: "#C6FF3D", fontSize: 12, fontWeight: 800, padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>JUGAR <ChevronRight size={14} /></button>
          }
        </div>
      </div>
    </div>
  );
}

/* ---- Verify ---- */
function Verify({ boletos, pendientes }) {
  const [tel, setTel] = useState("");
  const [resultado, setResultado] = useState(null);
  const [buscado, setBuscado] = useState(false);
  const buscar = () => {
    setBuscado(true);
    const aprobados = Object.entries(boletos||{}).filter(([,info])=>info&&info.telefono===tel.trim()).map(([num])=>num);
    const pend = (pendientes||[]).filter(p=>p.telefono===tel.trim()&&p.estado==="pendiente");
    setResultado({ aprobados, pendientes: pend });
  };
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px" }}>
      <h2 style={{ fontFamily: "'Arial Black',sans-serif", fontSize: 22, marginBottom: 6 }}>VERIFICAR BOLETO</h2>
      <p style={{ color: "#9AA1AC", fontSize: 13, marginBottom: 24 }}>Ingresa el número de teléfono que usaste al comprar.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input style={{ flex:1, background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", padding:"12px 14px", borderRadius:10, fontSize:14, outline:"none" }}
          placeholder="809-000-0000" value={tel} onChange={e=>setTel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscar()} />
        <button onClick={buscar} style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"12px 18px", borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
          <ShieldCheck size={16}/> Buscar
        </button>
      </div>
      {buscado && resultado && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {resultado.aprobados.length>0 && (
            <div style={{ display:"flex", gap:12, background:"#14171C", border:"1px solid rgba(198,255,61,0.3)", borderRadius:12, padding:16 }}>
              <ShieldCheck size={18} style={{ color:"#C6FF3D", flexShrink:0 }} />
              <div><div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>Boletos aprobados</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {resultado.aprobados.map(n=><span key={n} style={{ background:"#C6FF3D", color:"#0D0F12", fontFamily:"'Arial Black',sans-serif", fontSize:11, padding:"4px 9px", borderRadius:6 }}>{n}</span>)}
                </div>
              </div>
            </div>
          )}
          {resultado.pendientes.length>0 && (
            <div style={{ display:"flex", gap:12, background:"#14171C", border:"1px solid rgba(255,107,53,0.3)", borderRadius:12, padding:16 }}>
              <Clock size={18} style={{ color:"#FF6B35", flexShrink:0 }} />
              <div><div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>Pendientes de validación</div>
                {resultado.pendientes.map(p=><div key={p.id} style={{ fontSize:12, color:"#9AA1AC" }}>{p.cantidad} boleto{p.cantidad>1?"s":""} · {fmtMoney(p.total)}</div>)}
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
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {(historial||[]).map(h=>(
          <div key={h.id} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:14, overflow:"hidden" }}>
            {h.foto && (
              <div style={{ width:"100%", paddingBottom:"177.78%", position:"relative", overflow:"hidden" }}>
                <img src={h.foto} alt={h.nombre} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(20,23,28,0.95) 0%, transparent 50%)" }} />
                <div style={{ position:"absolute", bottom:14, left:16, right:16, display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:17, color:"#F2F2EF" }}>{h.nombre}</div>
                    <div style={{ fontSize:12, color:"#C6FF3D", fontWeight:700, marginTop:3 }}>Boleto #{h.numero} · {h.premio}</div>
                  </div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", textAlign:"right" }}>{new Date(h.fecha).toLocaleDateString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric"})}</div>
                </div>
              </div>
            )}
            {!h.foto && (
              <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px" }}>
                <Trophy size={20} style={{ color:"#C6FF3D", flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{h.premio}</div>
                  <div style={{ fontSize:12, color:"#9AA1AC", marginTop:2 }}>{h.nombre} · Boleto #{h.numero}</div>
                </div>
                <div style={{ fontSize:11, color:"#9AA1AC" }}>{new Date(h.fecha).toLocaleDateString("es-DO")}</div>
              </div>
            )}
            {h.foto && h.telefono && (
              <div style={{ padding:"8px 16px 12px", fontSize:12, color:"#9AA1AC" }}>📞 {h.telefono}</div>
            )}
          </div>
        ))}
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
  const ASPECT = 10 / 16; // height / width

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setOffset({ x: 0, y: 0 });
      setScale(1);
      draw(img, { x: 0, y: 0 }, 1);
    };
    img.src = src;
  }, [src]);

  const draw = (img, off, sc) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const iw = img.width * sc, ih = img.height * sc;
    ctx.drawImage(img, off.x, off.y, iw, ih);
    // overlay
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    const cropH = W * ASPECT;
    const cy = (H - cropH) / 2;
    ctx.fillRect(0, 0, W, cy);
    ctx.fillRect(0, cy + cropH, W, H - cy - cropH);
    ctx.strokeStyle = "#C6FF3D";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, cy, W, cropH);
    // guides
    ctx.strokeStyle = "rgba(198,255,61,0.3)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(W * i / 3, cy); ctx.lineTo(W * i / 3, cy + cropH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy + cropH * i / 3); ctx.lineTo(W, cy + cropH * i / 3); ctx.stroke();
    }
  };

  const redraw = (off, sc) => { if (imgRef.current) draw(imgRef.current, off, sc); };

  const onMouseDown = (e) => { setDrag(true); setStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); };
  const onMouseMove = (e) => {
    if (!drag) return;
    const off = { x: e.clientX - start.x, y: e.clientY - start.y };
    setOffset(off); redraw(off, scale);
  };
  const onMouseUp = () => setDrag(false);
  const onTouchStart = (e) => { const t = e.touches[0]; setDrag(true); setStart({ x: t.clientX - offset.x, y: t.clientY - offset.y }); };
  const onTouchMove = (e) => {
    if (!drag) return;
    const t = e.touches[0];
    const off = { x: t.clientX - start.x, y: t.clientY - start.y };
    setOffset(off); redraw(off, scale);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const sc = Math.max(0.3, Math.min(4, scale - e.deltaY * 0.001));
    setScale(sc); redraw(offset, sc);
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

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:500, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:20 }}>
      <div style={{ fontSize:13, color:"#9AA1AC", textAlign:"center" }}>
        Arrastra para reposicionar · Rueda del ratón para zoom<br/>
        <span style={{ color:"#C6FF3D", fontWeight:700 }}>El área entre las líneas verdes es lo que se verá</span>
      </div>
      <canvas ref={canvasRef} width={520} height={400}
        style={{ borderRadius:12, cursor:drag?"grabbing":"grab", touchAction:"none", maxWidth:"100%", background:"#0D0F12" }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
        onWheel={onWheel}
      />
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
  const [form, setForm] = useState(rifa ? { ...rifa } : {
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
  });
  const [tab, setTab] = useState("info"); // info | fotos | avanzado
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
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const load = async (key, def) => { return await dbGet(key, def); };
      const generarBoletos = () => { const o={}; for(let i=0;i<1000;i++) o[String(i).padStart(3,"0")]=null; return o; };
      const bRaw = await load("tickets", null);
      const b = (bRaw && Object.keys(bRaw).length>0) ? bRaw : generarBoletos();
      const p = await load("pending", []);
      const g = await load("ganador", null);
      const h = await load("historial", []);
      const r = await load("rifas", RIFAS_INICIALES);
      const mp = await load("metodosPago", METODOS_PAGO_INICIALES);
      setBoletos(b); setPendientes(p); setGanador(g); setHistorial(h); setRifas(r); setMetodosPago(mp);
      setReady(true);
    })();
  }, []);

  const save = async (key, val, setter) => { setter(val); const ok = await dbSet(key, val); return ok; };
  const showToast = (msg, kind="ok") => { setToast({msg,kind}); setTimeout(()=>setToast(null),3200); };

  const vendidosCount = Object.values(boletos).filter(Boolean).length;
  const pctGlobal = Math.round((vendidosCount/1000)*100);

  const refreshFromFirebase = async () => {
    try {
      const p = await dbGet("pending", []);
      const b = await dbGet("tickets", {});
      const h = await dbGet("historial", []);
      const r = await dbGet("rifas", RIFAS_INICIALES);
      setPendientes(p);
      setBoletos(b);
      setHistorial(h);
      setRifas(r);
    } catch {}
  };

  const irARifa = (rifa) => { setRifaActiva(rifa); setView("rifa"); };

  useEffect(() => {
    const check = () => { if (window.location.hash === "#admin9810") setView("admin"); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  /* ---- Auto-refresh pendientes cuando el admin está abierto ---- */
  useEffect(() => {
    if (view !== "admin") return;
    const intervalo = setInterval(async () => {
      try {
        const p = await dbGet("pending", []);
        setPendientes(p);
        const b = await dbGet("tickets", {});
        setBoletos(b);
      } catch {}
    }, 20000); // cada 20 segundos
    return () => clearInterval(intervalo);
  }, [view]);

  if (!ready) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#0D0F12", color:"#C6FF3D", gap:12, fontFamily:"'Arial Black',sans-serif", letterSpacing:1 }}>
      <Zap size={40} style={{ animation:"pulse 1.2s ease-in-out infinite" }} />
      CARGANDO SISTEMA…
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );

  return (
    <div style={{ background:"#0D0F12", color:"#F2F2EF", minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes slidein{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        button,input,select,textarea{font-family:inherit;}
        .nb{background:none;border:none;color:#9AA1AC;font-weight:600;font-size:14px;padding:10px 14px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:5px;transition:color .15s;}
        .nb:hover{color:#F2F2EF;}
        .nb.on{color:#0D0F12;background:#C6FF3D;}
        @media(max-width:768px){
          .nb{font-size:12px;padding:8px 10px;}
          .catalog-section{padding:32px 16px !important;}
          .hero-section{padding:48px 16px 40px !important;}
          .header-inner{padding:12px 16px !important;}
        }
      `}</style>

      {toast && (
        <div style={{ position:"fixed", top:18, right:18, zIndex:300, background:"#14171C", border:`1px solid ${toast.kind==="warn"?"#FF6B35":"#C6FF3D"}`, color:"#F2F2EF", padding:"12px 18px", borderRadius:10, fontSize:13, maxWidth:320, animation:"slidein .25s ease", boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <header style={{ position:"sticky", top:0, zIndex:40, background:"rgba(13,15,18,0.92)", backdropFilter:"blur(8px)", borderBottom:"1px solid #232830" }}>
        <div style={{ maxWidth:1400, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 40px", flexWrap:"wrap", gap:8 }}>
          <button onClick={()=>setView("catalogo")} style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", color:"#F2F2EF", fontFamily:"'Arial Black',sans-serif", fontSize:14, letterSpacing:"0.5px", cursor:"pointer" }}>
            <Zap size={22} style={{ color:"#C6FF3D" }}/> HIRALDO <strong style={{ marginLeft:2 }}>POWER</strong>
          </button>
          <nav style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            <button className={`nb${view==="catalogo"||view==="rifa"?" on":""}`} onClick={()=>setView("catalogo")}>Rifas</button>
            <button className={`nb${view==="ganadores"?" on":""}`} onClick={()=>setView("ganadores")}><Trophy size={13}/> Ganadores</button>
            <button className={`nb${view==="verify"?" on":""}`} onClick={()=>setView("verify")}><ShieldCheck size={13}/> Verificar boleto</button>
          </nav>
        </div>
        <div style={{ height:3, background:"#232830" }}>
          <div style={{ height:"100%", width:`${pctGlobal}%`, background:"#C6FF3D", transition:"width .4s" }} />
        </div>
      </header>

      {/* CATÁLOGO */}
      {view==="catalogo" && (
        <div>
          {ganador && (
            <div style={{ display:"flex", alignItems:"center", gap:14, background:"#C6FF3D", color:"#0D0F12", padding:"16px 20px" }}>
              <PartyPopper size={20}/>
              <div>
                <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:14 }}>¡Tenemos ganador! Boleto #{ganador.numero}</div>
                <div style={{ fontSize:12, opacity:0.8, marginTop:2 }}>{ganador.nombre} · {new Date(ganador.fecha).toLocaleDateString("es-DO")}</div>
              </div>
            </div>
          )}
          <section style={{ padding:"80px 40px 60px", borderBottom:"1px solid #232830", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(#232830 1px,transparent 1px),linear-gradient(90deg,#232830 1px,transparent 1px)", backgroundSize:"32px 32px", opacity:0.25 }} />
            <div style={{ position:"relative", maxWidth:900, margin:"0 auto", textAlign:"center" }}>
              <div style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, fontWeight:700, letterSpacing:1, color:"#FF6B35", background:"rgba(255,107,53,0.1)", border:"1px solid rgba(255,107,53,0.3)", padding:"6px 12px", borderRadius:999, marginBottom:24 }}>
                <Zap size={12}/> HIRALDO POWER · RIFAS EN VIVO
              </div>
              <h1 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:"clamp(36px,5vw,68px)", lineHeight:1.08, marginBottom:16 }}>
                CATÁLOGO <span style={{ background:"linear-gradient(90deg,#818cf8,#ec4899)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>DE RIFAS</span>
              </h1>
              <p style={{ color:"#9AA1AC", fontSize:15, maxWidth:600, margin:"0 auto" }}>Selecciona tu artículo soñado y asegura tu oportunidad.</p>
            </div>
          </section>
          <section style={{ maxWidth:1400, margin:"0 auto", padding:"48px 40px" }}>
            {rifas.filter(r=>r.activa).length===0 && (
              <p style={{ color:"#9AA1AC", fontSize:14, textAlign:"center" }}>No hay rifas activas en este momento.</p>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:24 }}>
              {rifas.filter(r=>r.activa).map(r=>(
                <RifaCard key={r.id} rifa={r} vendidosCount={vendidosCount} onJugar={()=>irARifa(r)} />
              ))}
            </div>
            {rifas.filter(r=>!r.activa).length>0 && (
              <>
                <h2 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:13, color:"#9AA1AC", letterSpacing:1, marginTop:48, marginBottom:16 }}>RIFAS FINALIZADAS</h2>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:24, opacity:0.6 }}>
                  {rifas.filter(r=>!r.activa).map(r=>(
                    <RifaCard key={r.id} rifa={r} vendidosCount={0} onJugar={()=>{}} />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* DETALLE / COMPRA */}
      {view==="rifa" && rifaActiva && (
        <RifaDetalle rifa={rifas.find(r=>r.id===rifaActiva.id)||rifaActiva} boletos={boletos}
          setBoletos={b=>save("tickets",b,setBoletos)} pendientes={pendientes}
          setPendientes={p=>save("pending",p,setPendientes)} showToast={showToast}
          onVolver={()=>setView("catalogo")} vendidosCount={vendidosCount} metodosPago={metodosPago} />
      )}

      {view==="verify" && <Verify boletos={boletos} pendientes={pendientes} />}
      {view==="ganadores" && <Ganadores historial={historial} />}
      {view==="admin" && (
        <Admin boletos={boletos} saveBoletos={b=>save("tickets",b,setBoletos)}
          pendientes={pendientes} savePendientes={p=>save("pending",p,setPendientes)}
          showToast={showToast} ganador={ganador} saveGanador={g=>save("ganador",g,setGanador)}
          historial={historial} saveHistorial={h=>save("historial",h,setHistorial)}
          vendidosCount={vendidosCount} rifas={rifas} saveRifas={r=>save("rifas",r,setRifas)}
          metodosPago={metodosPago} saveMetodosPago={mp=>save("metodosPago",mp,setMetodosPago)}
          onRefresh={refreshFromFirebase} />
      )}

      <footer style={{ textAlign:"center", padding:"40px 20px 50px", color:"#9AA1AC", fontSize:12, borderTop:"1px solid #232830" }}>
        <div><Zap size={14} style={{ color:"#C6FF3D", verticalAlign:-2 }}/> <strong style={{ color:"#F2F2EF" }}>HIRALDO POWER</strong></div>
        <p style={{ marginTop:6 }}>Rifas en vivo y verificables</p>
      </footer>
    </div>
  );
}

/* ---- Vista detalle / compra ---- */
function RifaDetalle({ rifa, boletos, setBoletos, pendientes, setPendientes, showToast, onVolver, vendidosCount, metodosPago }) {
  const [cantidad, setCantidad] = useState(1);
  const [showCheckout, setShowCheckout] = useState(false);
  const total = cantidad * rifa.precio;
  return (
    <main style={{ maxWidth:560, margin:"0 auto", padding:"40px 20px" }}>
      <button onClick={onVolver} style={{ background:"none", border:"none", color:"#9AA1AC", fontSize:13, cursor:"pointer", marginBottom:24, display:"flex", alignItems:"center", gap:6 }}>← Volver al catálogo</button>
      <RifaCard rifa={rifa} vendidosCount={vendidosCount} onJugar={()=>setShowCheckout(true)} />
      <div style={{ marginTop:32 }}>
        <h2 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:18, marginBottom:6 }}>ELIGE TU CANTIDAD</h2>
        <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:20 }}>Los números se asignan al azar al aprobar tu pago.</p>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:24, marginBottom:16 }}>
          <button onClick={()=>setCantidad(c=>Math.max(1,c-1))} style={{ width:48, height:48, borderRadius:12, background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", fontSize:22, fontWeight:700, cursor:"pointer" }}>−</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:40, color:"#C6FF3D" }}>{cantidad}</div>
            <div style={{ fontSize:12, color:"#9AA1AC", textTransform:"uppercase" }}>boleto{cantidad>1?"s":""}</div>
          </div>
          <button onClick={()=>setCantidad(c=>Math.min(rifa.totalBoletos-vendidosCount,c+1))} style={{ width:48, height:48, borderRadius:12, background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", fontSize:22, fontWeight:700, cursor:"pointer" }}>+</button>
        </div>
        <div style={{ textAlign:"center", fontSize:15, marginBottom:18 }}>Total: <strong style={{ fontFamily:"'Arial Black',sans-serif", color:"#C6FF3D" }}>{fmtMoney(total)}</strong></div>
        <button onClick={()=>setShowCheckout(true)} style={{ width:"100%", background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:14, padding:"14px 20px", borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}>
          Comprar {cantidad} boleto{cantidad>1?"s":""} <ChevronRight size={16}/>
        </button>
      </div>
      {showCheckout && (
        <CheckoutModal selected={cantidad} total={total} metodosPago={metodosPago} onClose={()=>setShowCheckout(false)}
          onConfirm={async(datos)=>{
            const nuevo={id:"P"+Date.now(),...datos,cantidad,total,fecha:new Date().toISOString(),estado:"pendiente"};
            const ok = await setPendientes([...pendientes,nuevo]);
            if(ok===false){
              showToast("Error al guardar. Intenta de nuevo o contacta al organizador.","warn");
              return;
            }
            setShowCheckout(false); setCantidad(1);
            showToast("¡Compra recibida! Validaremos tu pago en máximo 24 horas.","ok");
          }} />
      )}
    </main>
  );
}

/* ---- Checkout ---- */
function CheckoutModal({ selected, total, onClose, onConfirm, metodosPago }) {
  const metodos = (metodosPago||[]).filter(m=>m.activo);
  const [nombre,setNombre]=useState("");
  const [telefono,setTelefono]=useState("");
  const [metodoId,setMetodoId]=useState(()=> (metodosPago||[]).filter(m=>m.activo)[0]?.id || "");
  const [acepta,setAcepta]=useState(false);
  const [copiado,setCopiado]=useState(null);
  const [captura,setCaptura]=useState("");
  const capturaRef = useRef(null);
  const metodoSel = metodos.find(m=>m.id===metodoId);
  const esEfectivo = metodoSel?.tipo==="efectivo";
  const valido=nombre.trim().length>2&&telefono.trim().length>=10&&acepta&&!!metodoSel&&(esEfectivo||captura);
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
          <div style={{ display:"flex", gap:10, background:"rgba(198,255,61,0.05)", border:"1px solid rgba(198,255,61,0.2)", borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:13, color:"#9AA1AC" }}>
            <Zap size={16} style={{ color:"#C6FF3D", flexShrink:0, marginTop:1 }}/> El organizador coordinará contigo el pago en persona por WhatsApp.
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

  const cargarArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      set("foto", ev.target.result);
      setLinkFoto("");
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
          <button onClick={guardar} disabled={!valido}
            style={{ flex:2, background:valido?"#C6FF3D":"#232830", color:valido?"#0D0F12":"#9AA1AC", border:"none", fontWeight:800, fontSize:13, padding:"12px 0", borderRadius:10, cursor:valido?"pointer":"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Check size={15}/> {esNuevo?"Agregar al historial":"Guardar cambios"}
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
    activo: true,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valido = form.nombre.trim().length > 0;

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

/* ============================================================
   ADMIN PANEL
   ============================================================ */
function Admin({ boletos, saveBoletos, pendientes, savePendientes, showToast, ganador, saveGanador, historial, saveHistorial, vendidosCount, rifas, saveRifas, metodosPago, saveMetodosPago, onRefresh }) {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [numSorteo, setNumSorteo] = useState("");
  const [premioDsc, setPremioDsc] = useState("Scooter eléctrica");
  const [confirmando, setConfirmando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [editandoMetodo, setEditandoMetodo] = useState(null);
  const [editandoGanador, setEditandoGanador] = useState(null);
  const [tabAdmin, setTabAdmin] = useState("compras");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
    showToast("Datos actualizados ✓", "ok");
  };

  const disponibles = Object.keys(boletos).filter(k=>!boletos[k]);
  const pendientesActivos = pendientes.filter(p=>p.estado==="pendiente");
  const vendidos = Object.entries(boletos).filter(([,v])=>v);

  const aprobar = async (p) => {
    const pool=[...disponibles];
    if(pool.length<p.cantidad){showToast("No hay suficientes boletos","warn");return;}
    const next={...boletos}; const asignados=[];
    for(let i=0;i<p.cantidad&&pool.length;i++){
      const idx=Math.floor(Math.random()*pool.length);
      const num=pool.splice(idx,1)[0];
      next[num]={nombre:p.nombre,telefono:p.telefono,fecha:p.fecha};
      asignados.push(num);
    }
    await saveBoletos(next);
    await savePendientes(pendientes.map(x=>x.id===p.id?{...x,estado:"aprobado",asignados}:x));
    showToast(`${asignados.length} boletos asignados a ${p.nombre}: ${asignados.join(", ")}`, "ok");
  };

  const rechazar = async (p) => {
    await savePendientes(pendientes.filter(x=>x.id!==p.id));
    showToast("Compra rechazada","warn");
  };

  if (!unlocked) return (
    <div style={{ maxWidth:480, margin:"0 auto", padding:"40px 20px" }}>
      <h2 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:22, marginBottom:6 }}>PANEL ADMIN</h2>
      <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:24 }}>Acceso solo para Hiraldo Power.</p>
      <div style={{ display:"flex", gap:8 }}>
        <input type="password" placeholder="PIN de acceso" value={pin} onChange={e=>setPin(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&pin===ADMIN_PIN&&setUnlocked(true)}
          style={{ flex:1, background:"#14171C", border:"1px solid #232830", color:"#F2F2EF", padding:"12px 14px", borderRadius:10, fontSize:14, outline:"none" }} />
        <button onClick={()=>{if(pin===ADMIN_PIN)setUnlocked(true);else showToast("PIN incorrecto","warn");}}
          style={{ background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"12px 18px", borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
          <Lock size={14}/> Entrar
        </button>
      </div>
    </div>
  );

  const candidato = (() => {
    if(!numSorteo.trim()) return null;
    const key=numSorteo.trim().padStart(3,"0");
    const info=boletos[key];
    return info?{numero:key,...info}:{numero:key,noEncontrado:true};
  })();

  const confirmarGanador = async () => {
    if(!candidato||candidato.noEncontrado) return;
    const reg={numero:candidato.numero,nombre:candidato.nombre,telefono:candidato.telefono,premio:premioDsc.trim()||"Premio Hiraldo Power",fecha:new Date().toISOString()};
    await saveGanador(reg);
    await saveHistorial([{id:"H"+Date.now(),...reg},...historial]);
    showToast(`¡${candidato.nombre} es el ganador con el boleto #${candidato.numero}!`,"ok");
    setConfirmando(false); setNumSorteo("");
  };

  /* ---- GUARDAR RIFA ---- */
  const guardarRifa = async (form) => {
    let nuevas;
    if (rifas.find(r=>r.id===form.id)) {
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
    setEditando(null);
  };

  const TAB = ({id,label}) => (
    <button onClick={()=>setTabAdmin(id)} style={{ background:tabAdmin===id?"#C6FF3D":"#14171C", color:tabAdmin===id?"#0D0F12":"#9AA1AC", border:`1px solid ${tabAdmin===id?"#C6FF3D":"#232830"}`, fontWeight:700, fontSize:12, padding:"9px 18px", borderRadius:8, cursor:"pointer", letterSpacing:"0.4px" }}>{label}</button>
  );

  return (
    <main style={{ maxWidth:1400, margin:"0 auto", padding:"40px 40px" }}>
      {editando && <EditorRifa rifa={editando==="nueva"?null:editando} onGuardar={guardarRifa} onCancelar={()=>setEditando(null)} />}

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:22 }}>PANEL ADMIN</h2>
        <button onClick={handleRefresh} disabled={refreshing}
          style={{ display:"flex", alignItems:"center", gap:6, background:"#232830", border:"1px solid #C6FF3D", color:"#C6FF3D", fontWeight:700, fontSize:12, padding:"9px 16px", borderRadius:9, cursor:refreshing?"not-allowed":"pointer", opacity:refreshing?0.6:1 }}>
          {refreshing ? "Actualizando…" : "↻ Actualizar datos"}
        </button>
      </div>

      {/* STATS */}
      <div style={{ display:"flex", gap:24, marginBottom:28, flexWrap:"wrap" }}>
        {[["vendidos",vendidos.length,"#C6FF3D"],["pendientes",pendientesActivos.length,"#FF6B35"],["disponibles",disponibles.length,"#F2F2EF"],["rifas activas",rifas.filter(r=>r.activa).length,"#818cf8"]].map(([lbl,val,color])=>(
          <div key={lbl}>
            <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:28, color }}>{val}</div>
            <div style={{ fontSize:11, color:"#9AA1AC", textTransform:"uppercase", letterSpacing:"0.5px", marginTop:2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div style={{ display:"flex", gap:8, marginBottom:28, flexWrap:"wrap" }}>
        <TAB id="compras" label={`COMPRAS PENDIENTES (${pendientesActivos.length})`} />
        <TAB id="rifas" label="GESTIONAR RIFAS" />
        <TAB id="pagos" label="MÉTODOS DE PAGO" />
        <TAB id="boletos" label={`BOLETOS VENDIDOS (${vendidos.length})`} />
        <TAB id="ganadores" label={`GANADORES (${historial.length})`} />
        <TAB id="sorteo" label="SORTEO EN VIVO" />
      </div>

      {/* ---- TAB: COMPRAS ---- */}
      {tabAdmin==="compras" && (
        <div>
          {pendientesActivos.length===0 && <p style={{ color:"#9AA1AC", fontSize:13 }}>No hay compras pendientes.</p>}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {pendientesActivos.map(p=>(
              <div key={p.id} style={{ background:"#14171C", border:"1px solid #232830", borderRadius:12, padding:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10, flexWrap:"wrap", gap:8 }}>
                  <div><strong>{p.nombre}</strong><div style={{ fontSize:12, color:"#9AA1AC", marginTop:2 }}>{p.telefono} · {p.metodo} · {fmtMoney(p.total)}</div></div>
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
            ))}
          </div>
        </div>
      )}

      {/* ---- TAB: GESTIONAR RIFAS ---- */}
      {tabAdmin==="rifas" && (
        <div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:18 }}>
            <button onClick={()=>setEditando("nueva")} style={{ display:"flex", alignItems:"center", gap:8, background:"#C6FF3D", color:"#0D0F12", border:"none", fontWeight:800, fontSize:13, padding:"11px 18px", borderRadius:10, cursor:"pointer" }}>
              <Plus size={16}/> Nueva rifa
            </button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {rifas.map(r=>(
              <RifaRow key={r.id} r={r}
                onEditar={()=>setEditando(r)}
                onEliminar={async()=>{ await saveRifas(rifas.filter(x=>x.id!==r.id)); showToast("Rifa eliminada","warn"); }}
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
        <div style={{ display:"flex", flexDirection:"column", gap:1, background:"#232830", borderRadius:10, overflow:"hidden" }}>
          {vendidos.length===0 && <p style={{ color:"#9AA1AC", fontSize:13, padding:16 }}>Aún no hay boletos vendidos.</p>}
          {vendidos.map(([num,info])=>(
            <div key={num} style={{ display:"grid", gridTemplateColumns:"60px 1fr auto", alignItems:"center", gap:12, background:"#14171C", padding:"10px 14px", fontSize:13 }}>
              <span style={{ background:"#C6FF3D", color:"#0D0F12", fontFamily:"'Arial Black',sans-serif", fontSize:11, padding:"4px 8px", borderRadius:6, textAlign:"center" }}>{num}</span>
              <span>{info.nombre}</span>
              <span style={{ fontSize:12, color:"#9AA1AC" }}>{info.telefono}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- TAB: GANADORES ---- */}
      {tabAdmin==="ganadores" && (
        <div>
          {editandoGanador && (
            <EditorGanador
              ganador={editandoGanador==="nuevo"?null:editandoGanador}
              onGuardar={async(g)=>{
                let nuevos;
                if(historial.find(x=>x.id===g.id)) {
                  nuevos = historial.map(x=>x.id===g.id?g:x);
                  showToast("Ganador actualizado ✓","ok");
                } else {
                  nuevos = [{...g, id:"H"+Date.now()}, ...historial];
                  showToast("Ganador agregado ✓","ok");
                }
                await saveHistorial(nuevos);
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

      {/* ---- TAB: SORTEO ---- */}
      {tabAdmin==="sorteo" && (
        <div style={{ background:"#14171C", border:"1px solid #232830", borderRadius:14, padding:22 }}>
          <h3 style={{ fontFamily:"'Arial Black',sans-serif", fontSize:15, marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
            <Award size={17} style={{ color:"#C6FF3D" }}/> Sorteo en vivo
          </h3>
          {ganador ? (
            <div style={{ display:"flex", alignItems:"center", gap:16, background:"rgba(198,255,61,0.07)", border:"1px solid rgba(198,255,61,0.3)", borderRadius:12, padding:18 }}>
              <Trophy size={28} style={{ color:"#C6FF3D" }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:22, color:"#C6FF3D" }}>Boleto #{ganador.numero}</div>
                <div style={{ fontWeight:700, fontSize:15, marginTop:2 }}>{ganador.nombre}</div>
                <div style={{ fontSize:12, color:"#9AA1AC", marginTop:2 }}>{ganador.telefono} · {new Date(ganador.fecha).toLocaleString("es-DO")}</div>
              </div>
              <button onClick={()=>saveGanador(null)} style={{ background:"none", border:"1px solid rgba(255,84,112,0.3)", color:"#FF5470", fontWeight:700, fontSize:13, padding:"10px 16px", borderRadius:10, cursor:"pointer" }}>Reiniciar</button>
            </div>
          ) : (
            <>
              <p style={{ color:"#9AA1AC", fontSize:13, marginBottom:16 }}>Cuando saques la bolita ganadora, escribe el número para identificar al ganador. Hay {vendidos.length} boletos vendidos.</p>
              <label style={{ display:"block", marginBottom:14 }}>
                <span style={{ display:"block", fontSize:12, fontWeight:700, color:"#9AA1AC", marginBottom:6 }}>Premio de esta rifa</span>
                <input value={premioDsc} onChange={e=>setPremioDsc(e.target.value)} placeholder="Ej: Scooter eléctrica"
                  style={{ width:"100%", background:"#0D0F12", border:"1px solid #232830", color:"#F2F2EF", padding:"11px 12px", borderRadius:9, fontSize:14, outline:"none" }} />
              </label>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                <input placeholder="Número de la tómbola, ej: 047" value={numSorteo}
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
                  <AlertCircle size={18} style={{ flexShrink:0 }}/> El boleto #{candidato.numero} no fue vendido.
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
            <Trophy size={16}/> Solo entran a la tómbola los {vendidos.length} boletos vendidos y aprobados.
          </div>
        </div>
      )}
    </main>
  );
}
