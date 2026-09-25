/* =====================================================================
   SubSDJ · Arreglo — la forma a escala de minutos (eso es el ambient:
   cambio lento, colas largas, eventos escasos). Todo determinista con la
   semilla de la escena: misma semilla, misma sesión.
   · ENERGÍA E(compás) ∈ [0,1]: el knob Energía es el centro y Vaivén la
     amplitud de un vaivén en coseno de `ciclo` compases (arranca abajo,
     culmina a mitad de ciclo, vuelve a bajar: crescendo y descenso).
   · ENTRADAS: cada parte tiene un umbral (knob «Entra» del jugador): toca
     solo cuando E ≥ umbral — el dron a 0 siempre suena, el bombo a 0,7
     entra cuando la cosa se anima. Sin ruido en la curva ⇒ sin parpadeos.
   · SORPRESA: silencios de un compás repartidos al azar (hash determinista
     de semilla·compás·parte): los huecos que hace un músico que escucha.
   · La energía también escala velocity, probabilidad del pulso y densidad
     de la melodía (Player.js) y ABRE el filtro de todas las partes
     (macro en cents sobre el detune de los filtros: Apertura).
   ===================================================================== */
import { mulberry32 } from './Harmony.js';

export const ARR_DEF = { energia: 0.7, vaiven: 0.4, ciclo: 32, apertura: 0.5, sorpresa: 0.15 };
const MACRO_CENTS = 2400;   // Apertura 1 ⇒ ±1 octava de cutoff entre energía 0 y 1
const clamp01 = x => x < 0 ? 0 : (x > 1 ? 1 : x);

export class Arrangement {
  constructor(conductor) { this.c = conductor; this.cfg = { ...ARR_DEF }; }
  // Energía en el compás (admite fracción de compás: la macro va suave)
  energyAt(bar) {
    const c = this.cfg, n = Math.max(1, c.ciclo), ph = ((bar % n) + n) % n / n;
    return clamp01(c.energia + c.vaiven * 0.5 * -Math.cos(2 * Math.PI * ph));
  }
  // Silencio sorpresa de la parte i en el compás: determinista (semilla, compás, parte)
  rest(bar, i) {
    if (!(this.cfg.sorpresa > 0)) return false;
    return mulberry32((this.c.seed * 2654435761 + bar * 97 + i * 7919) | 0)() < this.cfg.sorpresa * 0.25;
  }
  // Lo que el jugador i necesita saber de este compás
  stateAt(bar, i, pcfg) {
    const E = this.energyAt(bar);
    const active = E + 1e-9 >= (pcfg.umbral || 0) && !this.rest(bar, i);
    // velocity 70-100 %, probabilidad del pulso 75-100 % (un bombo no debe deshacerse), densidad ±0.25
    return { E, active, velMul: 0.7 + 0.3 * E, probMul: 0.75 + 0.25 * E, dens: (E - 0.5) * 0.5 };
  }
  macroCents(bar) { return this.cfg.apertura * MACRO_CENTS * (this.energyAt(bar) - 0.5); }
}
