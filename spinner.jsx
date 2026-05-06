import React from 'react';

export default function App() {
    // Configurazione dei parametri: modifica qui i valori per aggiornare tutto l'SVG
    const branchWidth = 2.0; // Ridotto del 30% (da 4.3)
    const nodeRadius = 15.9;

    return (
        /* Contenitore di base neutro (puoi ometterlo quando lo importi nel tuo progetto) */
        <div className= "flex items-center justify-center w-full h-full min-h-screen" >

        {/* Componente Spinner: Trasparente e privo di testi */ }
        < div className = "w-300 h-300" >
            <svg viewBox="0 0 200 200" className = "w-full h-full overflow-visible" >
                <style>
                {`
                /* Animazione per il respiro del root centrale */
                @keyframes breathe {
                  0%, 100% { transform: scale(0.95); }
                  50% { transform: scale(1.10); }
                }

                /* Animazione di shake/bloom per i rami L1.
                  Durata totale 100%, ma l'azione si svolge solo nel primo 20%.
                  Questo permette di mettere in sequenza 5 nodi senza sovrapposizioni.
                */
                @keyframes shakeBloom {
                  0%  { transform: rotate(0deg) scale(1); }
                  2%  { transform: rotate(-3deg) scale(1.02); }
                  4%  { transform: rotate(3deg) scale(1.05); }
                  6%  { transform: rotate(-3deg) scale(1.08); }
                  8%  { transform: rotate(3deg) scale(1.1); }
                  10% { transform: rotate(0deg) scale(1.12); } /* Picco dello sforzo per sbocciare */
                  12% { transform: rotate(-3deg) scale(1.1); }
                  14% { transform: rotate(3deg) scale(1.08); }
                  16% { transform: rotate(-2deg) scale(1.05); }
                  18% { transform: rotate(2deg) scale(1.02); }
                  20% { transform: rotate(0deg) scale(1); }
                  100% { transform: rotate(0deg) scale(1); } /* Resta fermo in attesa del prossimo giro */
                }

                .center-pulse {
                  transform-origin: 100px 100px;
                  animation: breathe 3s ease-in-out infinite;
                }

                .branch-node {
                  transform-origin: 100px 100px;
                  animation: shakeBloom 2.5s linear infinite;
                }

                /* Sfalsamento (delay) per la sequenza alternata 1 > 3 > 5 > 2 > 4 */
                .node-1 { animation-delay: 0s; }
                .node-3 { animation-delay: 0.5s; }
                .node-5 { animation-delay: 1.0s; }
                .node-2 { animation-delay: 1.5s; }
                .node-4 { animation-delay: 2.0s; }
          `}
</style>

{/* RAMI E NODI L1 (Disegnati per primi in modo che stiano sotto il nodo centrale) */ }

{/* Nodo 1: Blu (Top) */ }
<g className="branch-node node-1" >
    <line x1="100" y1 = "100" x2 = "100" y2 = "30" stroke = "black" strokeWidth = { branchWidth } />
        <circle cx="100" cy = "30" r = { nodeRadius } fill = "#2A8EFC" />
            </g>

{/* Nodo 2: Verde (Top Right) -> Angolo: -18° */ }
<g className="branch-node node-2" >
    <line x1="100" y1 = "100" x2 = "166.5" y2 = "78.4" stroke = "black" strokeWidth = { branchWidth } />
        <circle cx="166.5" cy = "78.4" r = { nodeRadius } fill = "#3BCC42" />
            </g>

{/* Nodo 3: Arancio (Bottom Right) -> Angolo: 54° */ }
<g className="branch-node node-3" >
    <line x1="100" y1 = "100" x2 = "141.1" y2 = "156.6" stroke = "black" strokeWidth = { branchWidth } />
        <circle cx="141.1" cy = "156.6" r = { nodeRadius } fill = "#FF8C00" />
            </g>

{/* Nodo 4: Rosa (Bottom Left) -> Angolo: 126° */ }
<g className="branch-node node-4" >
    <line x1="100" y1 = "100" x2 = "58.9" y2 = "156.6" stroke = "black" strokeWidth = { branchWidth } />
        <circle cx="58.9" cy = "156.6" r = { nodeRadius } fill = "#FF1493" />
            </g>

{/* Nodo 5: Giallo (Top Left) -> Angolo: 198° */ }
<g className="branch-node node-5" >
    <line x1="100" y1 = "100" x2 = "33.5" y2 = "78.4" stroke = "black" strokeWidth = { branchWidth } />
        <circle cx="33.5" cy = "78.4" r = { nodeRadius } fill = "#FFD700" />
            </g>

{/* ROOT CENTRALE (Disegnato per ultimo così copre le giunture delle linee) */ }
<circle 
          cx="100"
cy = "100"
r = "24"
fill = "black"
className = "center-pulse"
    />
    </svg>
    </div>

    </div>
  );
}