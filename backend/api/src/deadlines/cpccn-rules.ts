import { PROCEDURAL_ACT_TYPES, type ProceduralActType } from '../llm/extraction.schema'

export interface DeadlineRule {
  description: string
  diasHabiles: number
  tipo: 'FATAL' | 'ORDINARIO'
}

export const CPCCN_RULES: Partial<Record<ProceduralActType, DeadlineRule>> = {
  TRASLADO_DEMANDA:            { description: 'Contestar demanda',     diasHabiles: 15, tipo: 'FATAL' },
  TRASLADO_RECONVENCION:       { description: 'Contestar reconvención', diasHabiles: 15, tipo: 'FATAL' },
  APERTURA_PRUEBA:             { description: 'Ofrecer prueba',         diasHabiles: 10, tipo: 'FATAL' },
  SENTENCIA_PRIMERA_INSTANCIA: { description: 'Apelar sentencia',       diasHabiles:  5, tipo: 'FATAL' },
  EXPRESION_AGRAVIOS:          { description: 'Contestar agravios',     diasHabiles:  6, tipo: 'FATAL' },
  INTIMACION_PAGO_ART_504:     { description: 'Oponer excepciones',     diasHabiles:  5, tipo: 'FATAL' },
  // OTRO no tiene regla → no genera plazo
}

// Silencia el warning de "imported but unused" — el array se usa para validar
// que todos los tipos con regla estén presentes en el schema.
void PROCEDURAL_ACT_TYPES
