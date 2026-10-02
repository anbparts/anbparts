// Sugestao automatica de categoria Magalu por palavra-chave na descricao/tipo de peca.
// Mesma ideia (e quase os mesmos regex) de shopeeCategoria.ts, mas o destino e' o CAMINHO da
// categoria folha no Magalu (tabela MagaluCategoria, sincronizada de /categories/hierarchy), sem o
// prefixo "Veiculos e Pecas/". O id e' resolvido pelo caminho na hora de gravar (ver pecas.ts).
// A arvore do Magalu e' bem mais generica que a da Shopee (varios "... para Veiculos"), entao
// onde nao ha folha especifica caimos em "Kit de Pecas para Motocicletas" (catch-all de moto).

export const MAGALU_PREFIXO_CAMINHO = 'Veículos e Peças/';

const MOTO = 'Peças e Acessórios para Motocicletas/';
const MOTOR = 'Peças de Motor/';
const ELET = 'Elétrica e Ignição/';
const SUSP = 'Suspensão e Direção/';
const CARR = 'Carroceria e Acabamento/';
const ROD = 'Sistemas de Rodagem para Veículos/';
const FRE = 'Freios para Veículos/';
const LUZ = 'Luzes Veiculares/';
const SENS = 'Sensores e Indicadores para Veículos/';
const ALIM = 'Alimentação e Injeção/';
const ARM = 'Armazenamento e Carga de Veículos/';
const EPI = 'Segurança de Veículos/Equipamentos de Proteção para Motociclistas/';
const SUP = 'Suportes para Veículos/';

export const MAGALU_CATEGORIA_FALLBACK = `${MOTO}Kit de Peças para Motocicletas`;

function normalizar(s: string | null | undefined): string {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-/]/g, ' ')
    .toLowerCase();
}

const REGRAS: Array<[RegExp, string]> = [
  // Vestuario / equipamentos / acessorios muito especificos
  [/ba(u|ú)s? traseiro|bauleto|ba(u|ú)s? lateral|parafuso.*(barras )?bau/, `${ARM}Bauleto para Motocicleta`],
  [/base (do )?bau|suporte.*bau/, `${ARM}Base de Baú para Motocicleta`],
  [/bagageiro/, `${ARM}Bagageiro`],
  [/\bcapacete/, `${EPI}Capacete para Motociclista`],
  [/viseira/, `${EPI}Viseira de Capacete para Motociclista`],
  [/intercomunicador/, `${EPI}Intercomunicador de Capacete para Motociclista`],
  [/protetor(es)? (de )?ma(o|os)\b/, `${EPI}Protetor de Mão`],
  [/mochila/, `${EPI}Mochila para Motociclista`],
  [/jaqueta/, `${EPI}Jaqueta para Motociclista`],
  [/\bbota(s)?\b/, `${EPI}Bota para Motociclista`],
  [/capa de chuva|capa impermeavel/, `${EPI}Capa de Chuva para Motociclista`],
  [/alforge/, `${ARM}Alforge para Motocicleta`],
  [/capa (de |para )?banco/, `${MOTO}Capa para Banco de Moto`],
  [/capa (para )?moto\b/, `${MOTO}Capa para Motocicleta`],
  [/painel|velocimetro|\bmanometro\b/, `${CARR}Painel para Veículos`],
  [/para.?brisa|\bbolha\b/, `${CARR}Para-brisa`],
  [/adesivo|emblema/, `${CARR}Emblema para Veículos`],
  [/phone holder|suporte (de )?celular/, `${SUP}Suporte de Celular para Veículos`],

  // Compostos que contem palavra de outra categoria (cilindro de freio, bobina de cilindro...) —
  // precisam vir ANTES das regras genericas pra nao serem engolidos por elas.
  [/sonda lambda|sensor oxigenio/, `${ALIM}Sonda Lambda`],
  [/cilindro (de )?(freio|mestre)|cilindro freio|flexivel.*freio/, `${FRE}Kit Freio para Veículo`],
  [/cilindro (de )?embreagem|cilindro auxiliar/, `${MOTOR}Cilindro Auxiliar de Embreagem para Veículos`],
  [/bobina/, `${ELET}Bobina de Ignição`],
  [/respiro/, `${MOTOR}Peça de Motor para Veículos`],
  [/sensor (de )?detonacao|\bknock\b/, `${SENS}Sensor de Detonação`],
  [/sensor (de )?(neutro|marcha)/, `${SENS}Sensor de Marcha`],
  [/sensor map|\bmap\b/, `${SENS}Sensor Map`],
  [/sensor (de )?(posicao )?(do )?virabrequim|\bckp\b|virbrequim/, `${SENS}Sensor de Posição do Virabrequim`],
  [/sensor (de )?abs|guia sensor/, `${SENS}Sensor ABS`],
  [/sensor (de )?(nivel )?oleo/, `${SENS}Sensor de Pressão`],

  // Ciclistica / estrutura com folha propria no Magalu
  [/\bmesa\b/, `${MOTO}Mesa de Motocicleta`],
  [/\bslider\b/, `${MOTO}Slider para Motocicleta`],
  [/defletor/, `${MOTO}Defletor para Motocicleta`],
  [/descanso lateral|pezinho|pedal (de )?descanso/, `${MOTO}Cavalete para Motocicleta`],
  [/eixo balanca|eixo (central )?da balanca/, `${SUSP}Eixo para Veículos`],
  [/balanca|quadro elastico/, `${SUSP}Braço de Suspensão para Veículos`],
  [/reservatorio/, `${SUSP}Reservatório para Veículos`],
  [/atuador (de )?marcha lenta/, `${ELET}Atuador de Marcha Lenta`],
  [/resfriador/, `${ALIM}Trocador de Calor Resfriador de Óleo`],
  [/capa (inferior |superior )?correia|protetor (de )?correia/, `${MOTOR}Protetor de Correia para Veículos`],
  [/porta objeto/, `${SUP}Porta-objetos para Veículos`],
  [/caixa (de )?ar\b/, `${MOTOR}Filtro de Ar para Veículos`],
  [/duto (de )?ar\b/, `${ALIM}Condutor de Ar para Carburador`],
  [/cano (de )?agua/, `${MOTOR}Mangueira para Veículos`],
  [/engrenagem|balanceiro/, `${MOTOR}Engrenagem para Veículos`],
  [/pescador|vareta (de )?oleo|\bflauta\b|duto respiro/, `${MOTOR}Peça de Motor para Veículos`],

  // Pneus e rodas
  [/\bpneu(s)?\b/, `${ROD}Pneu`],
  [/\broda(s)? (traseira|dianteira|completa)|\baro (de )?roda/, `${ROD}Roda para Veículos`],

  // Chassi / ciclistica
  [/\bretrovisor\b|espelho retrovisor/, `${CARR}Retrovisor`],
  [/\bbateria\b/, `${ELET}Bateria para Veículos`],
  [/cavalete/, `${MOTO}Cavalete para Motocicleta`],
  [/\bbengala/, `${MOTO}Bengala de Motocicleta`],
  [/guarda p(o|ó) bengala|sanfona/, `${MOTO}Guarda Pó Bengala`],
  [/ma(c|ç)aneta|\bmanete\b/, `${MOTO}Manete de Moto`],
  [/cabo (de )?embreagem/, `${MOTOR}Cabo de Embreagem para Veículos`],
  [/cabo (de )?(velocimetro)/, `${MOTOR}Cabo de Velocímetro`],
  [/cabo (de )?(tacometro|conta giro)/, `${MOTOR}Cabo Tacômetro`],
  [/\bcabo\b/, `${MOTOR}Cabo Afogador para Veículos`],
  [/suporte entre bancos|\bbanco\b/, `${SUSP}Banco para Veículos`],
  [/suporte (de |para )?placa/, `${CARR}Suporte para Placa de Veículo`],
  [/tampa.*tanque|bocal (do )?tanque/, `${CARR}Tampa do Tanque de Combustível`],
  [/rolamento|kit trava rolamento/, `${SUSP}Rolamento para Veículos`],
  [/cubo (de )?roda|eixo roda/, `${ROD}Cubo de Roda`],
  [/\braio(s)?\b/, `${ROD}Raio para Roda`],
  [/pedaleira|plataforma (dianteira|traseira|dian|tras)/, `${MOTOR}Pedaleira para Veículos`],
  [/manopla/, `${MOTO}Manopla para Motocicleta`],
  [/protetor carter|protetor(es)? (de )?carter/, `${CARR}Protetor de Cárter`],
  [/protetor(es)? (de )?motor/, `${MOTOR}Protetor de Motor para Veículos`],
  [/\balca(s)?\b/, `${MOTO}Alça para Motocicleta`],
  [/tanque (de )?combustive?l/, `${ALIM}Tanque de Combustível`],
  [/para ?lama/, `${CARR}Para-lama`],
  [/guidao/, `${MOTO}Guidão para Motocicleta`],
  [/carenagem|kit (de )?plastico|\bmorcegao\b|bico frontal|fixador carenagens|rabeta/, `${CARR}Carenagem para Veículos`],
  [/capa.*tanque|conexao tanque|registro.*tanque/, `${CARR}Tampa do Tanque de Combustível`],

  // Motor
  [/\bcilindro(s)?\b/, `${MOTOR}Cilindro de Motor`],
  [/carburador/, `${ALIM}Carburador para Veículos`],
  [/cabecote/, `${MOTOR}Cabeçote para Veículos`],
  [/motor de arranque|motor arranque|motor de partida|placa de partida/, `${ELET}Impulsor de Partida`],
  [/rele (de )?partida/, `${ELET}Automático de Partida`],
  [/anel (de )?pistao|aneis/, `${MOTOR}Anel de Pistão`],
  [/pistao/, `${MOTOR}Pistão para Veículos`],
  [/kit (de )?transmissao|kit relacao\b/, `${MOTO}Kit Relação para Motocicleta`],
  [/corrente (de )?comando/, `${MOTOR}Corrente de Comando`],
  [/corrente (de )?transmissao|\bcorrente\b/, `${MOTOR}Corrente de Transmissão`],
  [/estator/, `${ELET}Estator para Motocicleta`],
  [/comando (de )?valvula(s)?|arvore comando/, `${MOTOR}Comando de Válvula`],
  [/\bmancal\b/, `${MOTOR}Mancal`],
  [/\bbiela(s)?\b/, `${MOTOR}Biela para Motocicleta`],
  [/regulador retificador|retificador regulador|retificador (de )?voltagem|\bretificador\b/, `${ELET}Retificador para Veículos`],
  [/regulador (de )?voltagem/, `${ELET}Regulador de Voltagem para Veículos`],
  [/tensor (de )?corrente|esticador tensor|tensionador/, `${MOTO}Tensionador de Corrente para Motocicleta`],
  [/bomba (de )?oleo/, `${MOTOR}Bomba de Óleo`],

  // Transmissao
  [/embreagem/, `${MOTOR}Embreagem para Veículos`],
  [/\bcoroa\b|\bestrela\b/, `${MOTO}Coroa para Motocicleta`],
  [/pinhao/, `${MOTO}Pinhão para Motocicleta`],
  [/caixa (de )?marcha|cambio completo|caixa (de )?cambio|eixo (de )?cambio|eixo (de )?mudanca|eixo vareta pedal cambio|pedal (de )?cambio|pedal (de )?marcha|pedal troca marcha|trambulador|garfo(s)? (de )?cambio|seletor (de )?cambio|alavanca (impulsora|seletora)|interruptor neutro|tampa.*inspecao.*cambio|junta.*inspecao.*cambio|bucha.*cambio|pista cambio/, `${MOTOR}Câmbio para Veículos`],
  [/correia (de )?transmissao/, `${MOTOR}Correia para Veículos`],

  // Escape
  [/silencioso|silenciador|abafador/, `${MOTOR}Abafador de Escapamento`],
  [/ponteira/, `${MOTOR}Ponteira de Escapamento`],
  [/escapamento|\bescape\b|coletor (de )?escape|abracadeira escape/, `${MOTOR}Escapamento para Veículos`],

  // Iluminacao
  [/pisca|\bseta\b|lanterna|luz (de )?placa/, `${LUZ}Lanterna para Veículos`],
  [/\bfarol\b/, `${LUZ}Farol para Veículos`],

  // Ignicao / eletrica
  [/\bcdi\b|modulo (de )?injecao|modulo zfe|volante magnetico|\bmagneto\b|rotor pulsador|\bpulsador\b/, `${ELET}CDI para Motocicleta`],
  [/chave (de )?ignicao|capa (da )?ignicao|fixador cabos ignicao|cabos ignicao|kit chave\b/, `${ELET}Chave de Ignição para Veículos`],
  [/\bvela(s)? (de )?ignicao\b|\bvelas?\b/, `${ELET}Vela de Ignição`],
  [/bobina (de )?ignicao/, `${ELET}Bobina de Ignição`],

  // Filtros
  [/filtro (de )?ar\b/, `${MOTOR}Filtro de Ar para Veículos`],
  [/filtro (de )?oleo/, `${MOTOR}Filtro de Óleo para Veículos`],
  [/kit (de )?filtro|filtro canister|suporte (do )?filtro|solenoide canister/, `${MOTO}Filtro para Motocicletas`],

  // Freios / suspensao
  [/\bpinca\b/, `${FRE}Pinça de Freio`],
  [/disco (de |do )?freio|disco (do )?abs/, `${FRE}Disco de Freio`],
  [/freio|cebolinha|kit parafuso disco|central abs|modulo abs/, `${FRE}Kit Freio para Veículo`],
  [/amortecedor/, `${SUSP}Amortecedor`],

  // Sensores especificos
  [/sensor (de )?(rotacao|velocidade)/, `${SENS}Sensor de Velocidade para Veículo`],
  [/sensor (de )?temperatura/, `${SENS}Sensor de Temperatura para Veículo`],
  [/sensor (de )?(posicao )?(da )?borboleta|\btps\b/, `${ALIM}Sensor de Posição da Borboleta`],
  [/sensor (de )?(posicao )?(do )?virabrequim/, `${SENS}Sensor de Posição do Virabrequim`],
  [/sensor (de )?(pressao|oleo)/, `${SENS}Sensor de Pressão`],
  [/sensor (de )?(queda|inclinacao)|sensor (de )?marcha/, `${SENS}Sensor de Marcha`],
  [/sensor (de )?abs/, `${SENS}Sensor ABS`],
  [/sonda lambda/, `${ALIM}Sonda Lambda`],
  [/\bsensor\b/, `${SENS}Sensor de Rotação`],

  // Motor / injecao diversos
  [/bomba (de )?combustivel|boia (de )?combustivel/, `${ALIM}Bomba de Combustível para Veículos`],
  [/bomba (de )?agua/, `${MOTOR}Bomba de Água para Veículos`],
  [/bico injetor/, `${ALIM}Bico Injetor Automotivo`],
  [/corpo (de )?(borboleta|injecao)|\btbi\b|acelerador eletronico|carcaca (do )?acelerad/, `${ALIM}Injeção Eletrônica`],
  [/coletor (de )?admissao|junc[ãa]o (da )?admissao/, `${ALIM}Coletor de Admissão`],
  [/alternador/, `${ELET}Alternador para Veículos`],
  [/radiador/, `${SUSP}Radiador`],
  [/ventoinha|eletro ventilador/, `${ELET}Eletroventilador`],
  [/mangueira|\btubo\b|linha (de )?(oleo|refrigeracao|arrefecimento|ventilacao)/, `${MOTOR}Mangueira para Veículos`],
  [/retentor/, `${MOTOR}Retentor para Veículos`],
  [/junta (do |da )?(tampa (de )?valvula)/, `${MOTOR}Junta da Tampa de Válvula para Veículos`],
  [/\bjunta\b/, `${MOTOR}Junta para Veículos`],
  [/virabrequim/, `${MOTOR}Virabrequim para Veículos`],
  [/\bpolia\b/, `${MOTOR}Polia para Veículos`],
  [/\btucho\b/, `${MOTOR}Tucho para Motor`],
  [/\bvalvula(s)?\b/, `${MOTOR}Válvula para Veículos`],
  [/coxim/, `${MOTOR}Coxim para Veículos`],
  [/\becu\b|centralina/, `${ELET}ECU para Veículos`],
  [/chicote/, `${ELET}Chicote para Veículos`],
  [/\brele\b/, `${ELET}Relé para Veículos`],
  [/kit fusivel|caixa fusive(l|is)/, `${ELET}Fusível para Veículos`],
  [/modulo (de )?alarme|modulo (de )?seguranca|imobilizador|antena (do )?fob/, `Segurança de Veículos/Alarmes e Travas para Veículos/Alarme Automotivo`],
  [/chave (de )?punho|punho luz|interruptor/, `${ELET}Botão Interruptor para Veículos`],
  [/estribo/, `${CARR}Estribo para Veículos`],
  [/motor completo|bloco (do )?motor|bloco carcaca|\bcarter\b|tampa (esquerda |direita |frontal |do |da |interna |superior |inferior )?(motor|primaria)|tampa bomba|tampa esquerda\b|tampa direita\b/, `${MOTOR}Peça de Motor para Veículos`],

  // Fallback amplo: "suporte" generico
  [/\bsuporte\b/, `${SUP}Suporte para Veículos`],
];

/** Sugere o CAMINHO (sem o prefixo "Veiculos e Pecas/") da categoria folha Magalu pra peca. */
export function sugerirMagaluCategoriaCaminho(descricao?: string | null, tipoPeca?: string | null): string {
  const base = normalizar(`${tipoPeca || ''} ${descricao || ''}`);
  for (const [regex, caminho] of REGRAS) {
    if (regex.test(base)) return caminho;
  }
  return MAGALU_CATEGORIA_FALLBACK;
}
