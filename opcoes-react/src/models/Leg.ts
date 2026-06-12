export type OptionType = "call" | "put";
export type LegDirection = "buy" | "sell";

export interface Leg {
  id: string;

  // Código real da opção, ex: PETRF429
  optionCode?: string;

  direction: LegDirection;
  optionType: OptionType;

  strike: number;
  premium: number;
  quantity: number;
}