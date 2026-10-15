// The library: well-known rules with the starting conditions that show them off.

export const LIFE_PRESETS = [
  { name: "Conway's Life", rule: 'B3/S23', seed: { density: 0.35 } },
  { name: 'HighLife', rule: 'B36/S23', seed: { density: 0.35 } },
  { name: 'Day & Night', rule: 'B3678/S34678', seed: { density: 0.5 } },
  { name: 'Seeds', rule: 'B2/S', seed: { density: 0.3, area: 0.12 } },
  { name: 'Replicator', rule: 'B1357/S1357', seed: { density: 0.3, area: 0.05 } },
  { name: 'Maze', rule: 'B3/S12345', seed: { density: 0.3, area: 0.25 } },
  { name: 'Life without Death', rule: 'B3/S012345678', seed: { density: 0.2, area: 0.3 } },
  { name: 'Anneal', rule: 'B4678/S35678', seed: { density: 0.5 } },
  { name: 'Diamoeba', rule: 'B35678/S5678', seed: { density: 0.5 } },
  { name: '2×2', rule: 'B36/S125', seed: { density: 0.35 } },
  { name: 'Assimilation', rule: 'B345/S4567', seed: { density: 0.3, area: 0.3 } },
  { name: 'Coagulations', rule: 'B378/S235678', seed: { density: 0.35 } },
  { name: 'Walled Cities', rule: 'B45678/S2345', seed: { density: 0.35 } },
  { name: 'Long Life', rule: 'B345/S5', seed: { density: 0.35 } },
  { name: 'Amoeba', rule: 'B357/S1358', seed: { density: 0.35 } },
  { name: 'Serviettes', rule: 'B234/S', seed: { density: 0.25, area: 0.06 } },
  { name: 'Gnarl', rule: 'B1/S1', seed: { single: true } },
  { name: 'Vote', rule: 'B5678/S45678', seed: { density: 0.5 } },
];

export const ELEMENTARY_PRESETS = [
  { name: 'Rule 30', rule: 30, seed: 'single' },
  { name: 'Rule 90', rule: 90, seed: 'single' },
  { name: 'Rule 110', rule: 110, seed: 'single' },
  { name: 'Rule 184', rule: 184, seed: { random: 0.45 } },
  { name: 'Rule 150', rule: 150, seed: 'single' },
  { name: 'Rule 54', rule: 54, seed: { random: 0.5 } },
  { name: 'Rule 45', rule: 45, seed: 'single' },
  { name: 'Rule 73', rule: 73, seed: { random: 0.5 } },
  { name: 'Rule 22', rule: 22, seed: 'single' },
  { name: 'Rule 60', rule: 60, seed: 'single' },
  { name: 'Rule 126', rule: 126, seed: 'single' },
  { name: 'Rule 18', rule: 18, seed: { random: 0.5 } },
  { name: 'Rule 137', rule: 137, seed: 'single' },
  { name: 'Rule 169', rule: 169, seed: { random: 0.5 } },
  { name: 'Rule 225', rule: 225, seed: 'single' },
];

// Ant rules list the turn taken on each color. Turmites use Ed Pegg Jr.'s digit
// notation: for each state and color, the color to paint, a turn code
// (1 straight, 2 right, 4 U-turn, 8 left) and the next state.
export const ANT_PRESETS = [
  { name: "Langton's ant", rule: 'RL', steps: 11500 },
  { name: 'Chaotic growth', rule: 'RLR', steps: 400000 },
  { name: 'Symmetric growth', rule: 'LLRR', steps: 1200000 },
  { name: 'Square filler', rule: 'LRRRRRLLR', steps: 350000 },
  { name: 'Convoluted highway', rule: 'LLRRRLRLRLLR', steps: 45000 },
  { name: 'Moving triangle', rule: 'RRLLLRLLLRRR', steps: 140000 },
  { name: 'Diamond spiral', rule: 'LRRRRLLLRRR', steps: 400000 },
  { name: 'Framed square', rule: 'LRRL', steps: 1500000 },
  { name: 'Pinwheel', rule: 'LLRRRLRRRRR', steps: 1500000 },
  { name: 'Striped triangle', rule: 'RRLRLLRRRRRR', steps: 400000 },
  { name: 'Crossed square', rule: 'RRLRR', steps: 600000 },
  { name: 'Fibonacci spiral', rule: '181181121010', steps: 110000 },
  { name: 'Filled spiral', rule: '181010110120', steps: 170000 },
  { name: 'Nested cabinets', rule: '181121110011', steps: 100000 },
  { name: 'Woven placemat', rule: '021021110021', steps: 1500000 },
  { name: 'Box spiral', rule: '011081120011', steps: 150000 },
  { name: 'Striped spiral', rule: '021080181020', steps: 180000 },
  { name: 'Square spiral', rule: '120081180021', steps: 1500000 },
  { name: 'Coiled rope', rule: '111180121010', steps: 420000 },
  { name: 'Stepped pyramid', rule: '021080181110', steps: 60000 },
  { name: 'Maze', rule: '181181110012081111', steps: 900000 },
];

// The Turing machine that halts iff ZFC is inconsistent (see below), twelve states to a line.
const ZFC = [
  '1LB0LC_0LD1LB_0LC1LE_0LF1LB_0LG1LE_0LH1LI_0LJ1LE_1RK0LH_1LL1RM_0LN1LE_0RK0RO_0RP1RQ',
  '0RR1RS_0LT1LE_0LU0RO_0RV1RW_0RX1RY_0RAA1RAB_0LAC0RAD_0LAE1LE_1LC0LC_0RAF0RAG_0RAH0LAI_0RAJ1RAK',
  '0RAL1RAM_0RAF0RAN_0RS0LU_0LAH1RAO_0RAP1RAD_0LAQ1LE_0LAR0RAS_0RAT1RAG_0RAU1RAV_0RAW0LAX_0RAY1RBA_0RBB1RBC',
  '0RBD1RBE_0RAA1RBF_0RBG1RAN_0RBH0RAN_0RAN1RAP_0LBI1LE_1RAR1LC_0RBJ1RAS_0RBK1RAT_0RV1RBL_0RAO1RBM_0LAC0RAP',
  '0LH1LBN_0RAF0RBO_0RAO0LU_0RBP1RBQ_0RBR1RBS_0RAF0RBT_0RBU1RBV_0RBW0LU_0RAG1RBG_0LAR0RBX_0LBY1LE_0RCA1RAS',
  '0RA1RBK_0RCB0LAI_0RCC1RCD_0LAX1LBN_0RAD1RBO_0LAC0RBK_0RBU0LU_0RCE1RCF_0RBV1RCG_0RBO1RBT_0RBH0RBO_0LAJ1LCH',
  '0RBH0RBT_0RCI1RBX_0LCJ1LE_0LA1RCK_0RCL1RCM_0RCN1RZ_0LCO1RAM_0RAY1RCP_0RAA1RCQ_0RBP1LCR_0RCS1RCT_1RCU1RBX',
  '0RCJ1RCV_0RCW1RCK_0RCX1RCY_0RDA1RDB_0RDC1RDD_0RDE1RDF_0RCS1RBV_0RDG0LBA_0LDH1LY_0RBH0RBG_0RDI0LBA_1RDJ1RCU',
  '0RDK1RDL_0LDM1RCK_0RDN1RQ_0RDF1RDO_0RDP1RDQ_0RDR1RDS_0RAA1RDT_0RBD1RDU_0RDV1RDW_0RDX1RDY_0RCS1RDW_0RDV1REA',
  '0REB1REC_0LBN0RCU_0RAI1RED_0REE1REF_1LEG1LDM_0RX1REH_0RBU1RBU_0REI1REJ_0REK1REL_0REM1REN_0REO1REP_0REQ1RER',
  '0RES0LBL_0RET1REU_0RAA1RBQ_0RCG1RBS_0RBR1REV_0RAA1REW_0RAA0LAX_0RBV1RBA_0REX1RM_0RDV1REY_0RDH1RFA_0LBN0LDM',
  '0RFB1REA_0RCD1RFC_0RFD1RFE_0RFF1RFG_0RFH1RFI_0RFJ1RFK_0RFL1RFM_0RFL1RFN_0RFO1RFP_0RBD0LO_0RAM1RBW_0LFQ0LC',
  '0RAW1RCH_0RBV1RFR_0RBV1RFS_0RFT0LU_0RS1RFR_0RAA1RFU_0RFV1RFW_0RFX1LY_0RFY1RGA_0RGB1LGC_0RGD1RGE_0RGF1RGG',
  '0RGF1RGH_0RGI1RGJ_0RGK1RGL_0LGC1RGM_0RGN1RGO_0RGP1RGQ_0RGR1RGS_0RGT1RGU_0RGV1RGW_0RGX1RGY_0RAL1RCE_0RAW1LCR',
  '0RHA0LU_0RBH0RAT_0RHB0LU_0RV1RHC_0RHD1RHE_0RAF0RAT_0RHF1RCO_0RDN1RDF_0RDN1RHG_0RGA1RHH_0RX1RHI_0RDF1RDF',
  '0RDF1RHJ_0RHK1RHL_0RGM1RHM_0RCY1LHN_0RHO1RHP_0RGR1RHM_0RHQ1RHR_0RCX1RHS_0RHT1RHU_0RHV1RHW_0RDF1RCY_0RHU1RHX',
  '0RHV1RHU_0RGP1RHN_0RFJ1RHY_0RHH1RGP_0RGP1RIA_0RIB1RFJ_0RIC1RHP_0RID1RIE_0RDO1RDO_0RBH0RAG_0RL0LAI_0RGA1RAJ',
  '0RCN1RDN_0RHG1RX_0RX1RIF_0RHN1RIG_0RY1RHG_0RHV1RIH_0RDO1RII_0RIJ1RIK_0RIL1RGD_0RIM1RIN_0RIO1RIP_0RGI1RII',
  '0RIQ1RIR_0RII1RIK_0LFE1RBU_0RHG1RGD_0RIS1RHS_0RHG1RIS_0RGP1RIT_0RHH1RHG_0RIT1RIT_0RIU1RFD_0RGS1RIG_0RHG1RGM',
  '0RIV1RIW_0RIX1RIY_0RJA1REY_0RIM1RGI_0RDO1RHU_0RCL1RBU_0RIL1RCL_0RIG1RQ_0RGE1RDN_0RHS1RDF_0RDF1RIM_0RDO1RQ',
  '0RGB1RCY_0RGP1RCL_0RIP1RIL_0LFC1LIU_0RGD1LGN_0RQ1RIT_0RHG1RII_0RGI1RHN_0RHN1RJA_0RJB1RJC_0RV1LFQ_0RJC1RJD',
  '0RCN1RES_0REC1RFB',
].join('_');

// Turing machines, in the Busy Beaver Challenge's notation (see turing.js). The busy
// beavers run longest of all machines their size before halting.
export const TURING_PRESETS = [
  { name: 'Busy beaver, 2 states', rule: '1RB1LB_1LA1RZ' },
  { name: 'Busy beaver, 3 states', rule: '1RB1RZ_1LB0RC_1LC1LA' },
  { name: 'Busy beaver, 4 states', rule: '1RB1LB_1LA0LC_1RZ1LD_1RD0RA' },
  { name: 'Binary counter', rule: '2RB2RB1LA_0LA1RB2RB' },
  // It searches every proof from the axioms of set theory and halts if one proves a
  // contradiction, so it runs forever if and only if ZFC is consistent, which ZFC itself
  // can't prove. Mira's 254-state machine (October 2026), proved in Coq to halt iff ZFC
  // is inconsistent: zfc_254.tm in github.com/jeff87654/busy-beaver, under ZF/m254, with
  // its states 0 to 253 renamed A to JD. It spends its first 264,982 steps setting up.
  { name: 'Halts iff ZFC is inconsistent', sub: '254 states', rule: ZFC },
];
