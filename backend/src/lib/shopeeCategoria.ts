// Sugestao automatica de categoria Shopee por palavra-chave na descricao/tipo de peca.
// Ruleset construido manualmente classificando os 1067 SKUs em estoque em 2026-09-30 —
// ver conversa "ANB Parts - Claude" para o historico de refinamento.

// Categorias bloqueadas na Shopee (permitido:false) -> remapeadas pro "Outros" mais proximo
// (Chassis, 102453), pois Freios/Amortecedores/Baterias sao componentes do chassi/suspensao.
const CATEGORIAS_BLOQUEADAS = new Set([102434, 102435, 102538]); // Amortecedores, Freios, Baterias
const CHASSIS_OUTROS = 102453;

function normalizar(s: string | null | undefined): string {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-/]/g, ' ')
    .toLowerCase();
}

const REGRAS: Array<[RegExp, number]> = [
  // Acessórios muito especificos primeiro
  [/ba(u|ú)s? traseiro/, 102497],
  [/base (do )?bau|suporte.*bau/, 102498],
  [/bagageiro/, 102498],
  [/ba(u|ú)s? lateral/, 102499],
  [/\bcapacete/, 102541],
  [/viseira/, 102544],
  [/intercomunicador/, 102543],
  [/painel|velocimetro|\bmanometro\b/, 102542],
  [/para.?brisa|\bbolha\b/, 102545],
  [/alforge/, 102547],
  [/protetor(es)? (de )?ma(o|os)\b/, 102548],
  [/mochila/, 102549],
  [/adesivo|emblema/, 102550],
  [/capa (de |para )?banco/, 102502],
  [/capa de chuva|capa impermeavel/, 102491],
  [/capa (para )?moto\b/, 102501],
  [/jaqueta/, 102492],
  [/\bbota(s)?\b/, 102493],
  [/phone holder|suporte (de )?celular/, 102610],
  [/camera.*capacete|helmet camera/, 102611],

  // Pneus e Rodas
  [/\broda(s)? (traseira|dianteira|completa)/, 102561],
  [/\bpneu(s)?\b/, 102561],

  // Chassis especificos
  [/\bretrovisor\b|espelho retrovisor/, 102537],
  [/\bbateria\b/, 102538],
  [/cavalete/, 102438],
  [/\bbengala/, 102439],
  [/ma(c|ç)aneta/, 102441],
  [/cabo (de )?embreagem/, 102468],
  [/\bcabo\b/, 102442],
  [/suporte entre bancos|\bbanco\b/, 102443],
  [/suporte (de |para )?placa/, 102444],
  [/tampa.*tanque|bocal (do )?tanque/, 102445],
  [/cubo (de )?roda|eixo roda|kit trava rolamento|\brolamento\b/, 102446],
  [/\braio(s)?\b/, 102447],
  [/pedaleira/, 102448],
  [/manopla/, 102449],
  [/protetor(es)? (de )?(motor|carter)|protetor carter/, 102450],
  [/\balca(s)?\b/, 102451],
  [/tanque (de )?combustive?l/, 102452],
  [/para ?lama/, 102437],
  [/guidao/, 102436],
  [/carenagem|kit (de )?plastico|\bmorcegao\b|bico frontal|fixador carenagens/, 102433],
  [/plataforma (dianteira|traseira|dian|tras)/, 102448],
  [/parafuso.*fixacao (do )?plate|parafuso plate/, 102444],
  [/parafuso.*(barras )?bau/, 102499],
  [/capa.*tanque|conexao tanque|registro.*tanque/, 102445],

  // Motor especificos
  [/\bcilindro(s)?\b/, 102454],
  [/carburador/, 102455],
  [/cabecote/, 102456],
  [/motor de arranque|motor arranque|rele (de )?partida|motor de partida/, 102457],
  [/pistao/, 102458],
  [/kit (de )?transmissao|kit relacao\b/, 102467],
  [/corrente (de )?transmissao|\bcorrente\b/, 102459],
  [/estator/, 102460],
  [/comando (de )?valvula(s)?|arvore comando|mancal/, 102461],
  [/\bbiela(s)?\b/, 102462],
  [/regulador retificador|retificador regulador|retificador (de )?voltagem|regulador (de )?voltagem|\bretificador\b/, 102463],
  [/tensor (de )?corrente|esticador tensor/, 102464],
  [/bomba (de )?oleo/, 102465],

  // Transmissão especificos
  [/embreagem/, 102468],
  [/\bcoroa\b|\bestrela\b/, 102469],
  [/caixa (de )?marcha|cambio completo|caixa (de )?cambio/, 102470],
  [/eixo (de )?cambio|eixo (de )?mudanca|eixo vareta pedal cambio|pedal (de )?cambio|pedal (de )?marcha|pedal troca marcha|trambulador|garfo(s)? (de )?cambio|seletor (de )?cambio|alavanca (impulsora|seletora)|interruptor neutro|tampa.*inspecao.*cambio|junta.*inspecao.*cambio|bucha.*cambio|pista cambio/, 102471],
  [/correia (de )?transmissao/, 102472],

  // Escape
  [/escapamento|\bescape\b|ponteira|coletor (de )?escape|abracadeira escape/, 102474],
  [/silencioso|silenciador|abafador/, 102475],

  // Iluminação
  [/pisca|\bseta\b|lanterna|luz (de )?placa/, 102477],
  [/farol baixo/, 102479],
  [/\bfarol\b/, 102478],

  // Ignição
  [/\bcdi\b|modulo (de )?injecao|modulo zfe|volante magnetico|\bmagneto\b|rotor pulsador|\bpulsador\b/, 102481],
  [/chave (de )?ignicao|capa (da )?ignicao|fixador cabos ignicao|cabos ignicao|kit chave\b/, 102482],
  [/\bvela(s)? (de )?ignicao\b|\bvelas?\b/, 102483],
  [/bobina (de )?ignicao/, 102484],

  // Filtros
  [/filtro (de )?ar\b/, 102486],
  [/filtro (de )?oleo/, 102487],
  [/kit (de )?filtro/, 102488],
  [/filtro canister|suporte (do )?filtro|solenoide canister/, 102489],

  // Freios / Amortecedores (nao permitido na Shopee -> remapeado abaixo p/ Chassis Outros)
  [/freio|\bpinca\b|disco (do )?abs|cebolinha|kit parafuso disco|central abs|modulo abs/, 102435],
  [/amortecedor/, 102434],

  // Motor > Outros (sistemas/pecas diversas do motor sem bucket especifico)
  [/\bsensor\b|sonda lambda|bomba (de )?(agua|combustivel)|mangueira|radiador|bico injetor|alternador|coletor (de )?admissao|junc[ãa]o (da )?admissao|flange (da )?bomba combustivel|borracha (da )?flange|\bcarter\b|bloco (do )?motor|bloco carcaca|ventoinha|eletro ventilador|valvula (de )?comutacao|duto (de )?ar|caixa (de )?ar\b|atuador (de )?marcha lenta|servo motor|\bcano (de )?agua|tampa (esquerda |direita |frontal |do |da )?motor|tampa bomba|pescador (de )?oleo|corpo (de )?borboleta|carcaca (do )?acelerad|\becu\b|chicote|vareta (de )?oleo|retentor|junta (do |da )?(motor|cabecote|carter|cambio)|bujao (de )?oleo|coifa (do )?carburador|cano (de )?escape interno|virabrequim|balanceiro|\bpolia\b|corpo (de )?injecao|\btbi\b|coxim (do )?motor|suporte (do )?motor|eixo (suporte|dianteiro) motor|defletor (de )?ar motor|reservatorio (de )?(agua|oleo)|duto respiro|tampa suspiro tanque|valvula (de )?(oleo|solenoide|retencao|termostatica|palheta)|\bvalvula(s)?\b|acelerador eletronico|motor completo|\btucho\b|vareta (comando|valvula)|pinhao compensador|capa correia|parafuso (do )?corpo (de )?injecao|parafuso tbi|parafuso protetor (do )?motor|\bflauta\b|bucha.*motor|espacador.*motor|resfriador|boia (de )?combustivel|linha (de )?(oleo|refrigeracao|arrefecimento)|\btubo\b|kit conexao linha|eixo.*motor|tampa (interna |superior |inferior )?primaria|carcaca.*balacins|capa (inferior |superior )?correia|par coxim.*motor|coxim.*motor|motor (de )?arranque|tampao.*oleo|balancim|linha (de )?ventilacao|vapor.*tanque|guia cabos|tampa esquerda\b|tampa direita\b/, 102466],

  // Transmissão > Outros
  [/cardan|diferencial|junta homocinetica|parafuso (do )?cambio|engrenagem|placa (da )?transmissao|\bpiao\b|kit parafuso chassi e motor/, 102473],

  // Iluminação > Outros
  [/buzina/, 102480],

  // Ignição > Outros (alarme, modulos eletricos diversos)
  [/modulo (de )?alarme|modulo (de )?seguranca|imobilizador|antena (do )?fob|chave (de )?punho|punho luz|\brele\b|kit fusivel/, 102485],

  // Chassis > Outros (estrutural/generico sem sistema claro)
  [/\bquadro\b|\bmesa\b|balanca|acabamento|parafuso (do |da )?carcaca|parafuso chassi|tampa (caixa )?ferramentas|suporte (de )?guidao|suporte apoio (de )?mao|pedal (de )?descanso|descanso lateral|pezinho|tomada (12v|usb)|caixa (de )?ferramentas|braco (de )?direcao|estribo|moldura|caixa fusive(l|is)|protecao contra torcao|suporte bola|bacalhau|aranha|haste conectora|prolink|suporte cabos|conector.*jumper|jumper aterramento|presilhas bracadeiras|porca (barras|castelo)/, CHASSIS_OUTROS],

  // Fallback amplo: qualquer coisa com "suporte" generico ainda nao classificada -> Chassis Outros
  [/\bsuporte\b/, CHASSIS_OUTROS],
];

const OUTROS_GERAL = 102539; // Peças de Reposição para Motocicletas > Outros (catch-all)

/** Sugere um id de ShopeeCategoria com base na descricao/tipo da peca. Sempre retorna um id valido. */
export function sugerirShopeeCategoriaId(descricao?: string | null, tipoPeca?: string | null): number {
  const base = normalizar(`${tipoPeca || ''} ${descricao || ''}`);
  for (const [regex, id] of REGRAS) {
    if (regex.test(base)) {
      return CATEGORIAS_BLOQUEADAS.has(id) ? CHASSIS_OUTROS : id;
    }
  }
  return OUTROS_GERAL;
}
