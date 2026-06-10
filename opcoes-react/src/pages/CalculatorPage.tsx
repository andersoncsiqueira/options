import { useMemo, useState, type CSSProperties } from "react";
import Layout from "../components/Layout/Layout";

type OptionType = "CALL" | "PUT";
type LegSide = "BUY" | "SELL";
type ValuationStatus = "CHEAP" | "EXPENSIVE" | "FAIR";

type OptionLeg = {
  id: string;
  asset: string;
  optionCode: string;
  side: LegSide;
  type: OptionType;
  strike: string;
  marketPremium: string;
  volatility: string;
  quantity: string;
};

type ParsedOptionLeg = {
  id: string;
  asset: string;
  optionCode: string;
  side: LegSide;
  type: OptionType;
  strike: number;
  marketPremium: number;
  volatility: number;
  quantity: number;
};

type ChartPoint = {
  price: number;
  payoff: number;
};

type BlackScholesResult = {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  d1: number;
  d2: number;
};

const CONTRACT_SIZE = 100;
const DEFAULT_FAIR_VALUE_THRESHOLD = 5;

const createId = () =>
  `leg-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const parseDecimal = (value: string | number) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
};

const todayAsInputDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addDaysAsInputDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getDaysToExpiration = (expirationDate: string) => {
  if (!expirationDate) return 1;

  const today = new Date(`${todayAsInputDate()}T00:00:00`);
  const expiration = new Date(`${expirationDate}T23:59:59`);

  const diffMs = expiration.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(diffDays, 1);
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const formatOptionCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(value) ? value : 0);

const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

const formatPercent = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const normalCdf = (x: number) => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * absX);

  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-absX * absX));

  return 0.5 * (1 + sign * erf);
};

const normalPdf = (x: number) =>
  Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

function blackScholes(params: {
  spot: number;
  strike: number;
  volatility: number;
  riskFreeRate: number;
  dividendYield: number;
  daysToExpiration: number;
  type: OptionType;
}): BlackScholesResult {
  const {
    spot,
    strike,
    volatility,
    riskFreeRate,
    dividendYield,
    daysToExpiration,
    type,
  } = params;

  const safeSpot = Math.max(spot, 0.01);
  const safeStrike = Math.max(strike, 0.01);
  const time = Math.max(daysToExpiration, 1) / 365;
  const sigma = Math.max(volatility, 0.0001);
  const rate = riskFreeRate;
  const dividend = dividendYield;
  const sqrtTime = Math.sqrt(time);

  const d1 =
    (Math.log(safeSpot / safeStrike) +
      (rate - dividend + (sigma * sigma) / 2) * time) /
    (sigma * sqrtTime);

  const d2 = d1 - sigma * sqrtTime;

  const discountedSpot = safeSpot * Math.exp(-dividend * time);
  const discountedStrike = safeStrike * Math.exp(-rate * time);

  const call =
    discountedSpot * normalCdf(d1) - discountedStrike * normalCdf(d2);

  const put =
    discountedStrike * normalCdf(-d2) - discountedSpot * normalCdf(-d1);

  const delta =
    type === "CALL"
      ? Math.exp(-dividend * time) * normalCdf(d1)
      : Math.exp(-dividend * time) * (normalCdf(d1) - 1);

  const gamma =
    (Math.exp(-dividend * time) * normalPdf(d1)) /
    (safeSpot * sigma * sqrtTime);

  const vega =
    (safeSpot * Math.exp(-dividend * time) * normalPdf(d1) * sqrtTime) / 100;

  const thetaCall =
    (-safeSpot * Math.exp(-dividend * time) * normalPdf(d1) * sigma) /
      (2 * sqrtTime) -
    rate * safeStrike * Math.exp(-rate * time) * normalCdf(d2) +
    dividend * safeSpot * Math.exp(-dividend * time) * normalCdf(d1);

  const thetaPut =
    (-safeSpot * Math.exp(-dividend * time) * normalPdf(d1) * sigma) /
      (2 * sqrtTime) +
    rate * safeStrike * Math.exp(-rate * time) * normalCdf(-d2) -
    dividend * safeSpot * Math.exp(-dividend * time) * normalCdf(-d1);

  return {
    price: Math.max(type === "CALL" ? call : put, 0),
    delta,
    gamma,
    vega,
    theta: (type === "CALL" ? thetaCall : thetaPut) / 365,
    d1,
    d2,
  };
}

function calculateImpliedVolatility(params: {
  spot: number;
  strike: number;
  marketPremium: number;
  riskFreeRate: number;
  dividendYield: number;
  daysToExpiration: number;
  type: OptionType;
}) {
  const {
    spot,
    strike,
    marketPremium,
    riskFreeRate,
    dividendYield,
    daysToExpiration,
    type,
  } = params;

  const safeSpot = Math.max(spot, 0);
  const safeStrike = Math.max(strike, 0);
  const safeMarketPremium = Math.max(marketPremium, 0);

  if (safeMarketPremium <= 0 || safeSpot <= 0 || safeStrike <= 0) {
    return null;
  }

  const intrinsicValue =
    type === "CALL"
      ? Math.max(safeSpot - safeStrike, 0)
      : Math.max(safeStrike - safeSpot, 0);

  if (safeMarketPremium < intrinsicValue) {
    return null;
  }

  let lowVol = 0.0001;
  let highVol = 5;
  const tolerance = 0.0001;
  const maxIterations = 100;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const midVol = (lowVol + highVol) / 2;

    const result = blackScholes({
      spot: safeSpot,
      strike: safeStrike,
      volatility: midVol,
      riskFreeRate,
      dividendYield,
      daysToExpiration,
      type,
    });

    const difference = result.price - safeMarketPremium;

    if (Math.abs(difference) < tolerance) {
      return midVol;
    }

    if (result.price > safeMarketPremium) {
      highVol = midVol;
    } else {
      lowVol = midVol;
    }
  }

  return (lowVol + highVol) / 2;
}

function getPremiumStatus(
  marketPremium: number,
  theoreticalPremium: number,
  fairThresholdPercent: number
): ValuationStatus {
  const safeTheoretical = Math.max(theoreticalPremium, 0.01);
  const differencePercent =
    ((marketPremium - theoreticalPremium) / safeTheoretical) * 100;

  if (Math.abs(differencePercent) <= fairThresholdPercent) {
    return "FAIR";
  }

  return differencePercent < 0 ? "CHEAP" : "EXPENSIVE";
}

function getOperationStatus(params: {
  marketEntryDebit: number;
  theoreticalEntryDebit: number;
  fairThresholdPercent: number;
}): ValuationStatus {
  const { marketEntryDebit, theoreticalEntryDebit, fairThresholdPercent } =
    params;

  const base = Math.max(Math.abs(theoreticalEntryDebit), 1);
  const differencePercent =
    ((marketEntryDebit - theoreticalEntryDebit) / base) * 100;

  if (Math.abs(differencePercent) <= fairThresholdPercent) {
    return "FAIR";
  }

  return differencePercent < 0 ? "CHEAP" : "EXPENSIVE";
}

function getStatusLabel(status: ValuationStatus) {
  if (status === "CHEAP") return "Barata";
  if (status === "EXPENSIVE") return "Cara";
  return "Justa";
}

function getStatusStyle(status: ValuationStatus): CSSProperties {
  if (status === "CHEAP") {
    return {
      background: "rgba(34, 197, 94, 0.14)",
      border: "1px solid rgba(34, 197, 94, 0.35)",
      color: "#86efac",
    };
  }

  if (status === "EXPENSIVE") {
    return {
      background: "rgba(248, 113, 113, 0.14)",
      border: "1px solid rgba(248, 113, 113, 0.35)",
      color: "#fecaca",
    };
  }

  return {
    background: "rgba(234, 179, 8, 0.14)",
    border: "1px solid rgba(234, 179, 8, 0.35)",
    color: "#fde68a",
  };
}

function getOperationInterpretation(status: ValuationStatus) {
  if (status === "CHEAP") {
    return "A estrutura está mais barata para montar do que o valor teórico calculado pelo modelo.";
  }

  if (status === "EXPENSIVE") {
    return "A estrutura está mais cara para montar do que o valor teórico calculado pelo modelo.";
  }

  return "A estrutura está próxima do valor teórico calculado pelo modelo.";
}

function getSideLabel(side: LegSide) {
  return side === "BUY" ? "Compra" : "Venda";
}

function getTypeLabel(type: OptionType) {
  return type === "CALL" ? "Call" : "Put";
}

function calculateLegPayoff(leg: ParsedOptionLeg, underlyingPrice: number) {
  const intrinsicValue =
    leg.type === "CALL"
      ? Math.max(underlyingPrice - leg.strike, 0)
      : Math.max(leg.strike - underlyingPrice, 0);

  const unitPayoff =
    leg.side === "BUY"
      ? intrinsicValue - leg.marketPremium
      : leg.marketPremium - intrinsicValue;

  return unitPayoff * leg.quantity * CONTRACT_SIZE;
}

function calculateMarketEntryDebit(legs: ParsedOptionLeg[]) {
  return legs.reduce((total, leg) => {
    const value = leg.marketPremium * leg.quantity * CONTRACT_SIZE;

    return leg.side === "BUY" ? total + value : total - value;
  }, 0);
}

function calculateTheoreticalEntryDebit(
  legs: ParsedOptionLeg[],
  theoreticalPricesByLeg: Record<string, number>
) {
  return legs.reduce((total, leg) => {
    const theoreticalPremium = theoreticalPricesByLeg[leg.id] ?? 0;
    const value = theoreticalPremium * leg.quantity * CONTRACT_SIZE;

    return leg.side === "BUY" ? total + value : total - value;
  }, 0);
}

function buildChartPoints(
  legs: ParsedOptionLeg[],
  spot: number,
  rangePercent: number
) {
  const safeSpot = Math.max(spot, 0.01);
  const minPrice = Math.max(0.01, safeSpot * (1 - rangePercent));
  const maxPrice = Math.max(minPrice + 1, safeSpot * (1 + rangePercent));
  const steps = 120;

  return Array.from({ length: steps + 1 }, (_, index) => {
    const price = minPrice + ((maxPrice - minPrice) / steps) * index;

    const payoff = legs.reduce(
      (total, leg) => total + calculateLegPayoff(leg, price),
      0
    );

    return { price, payoff };
  });
}

function findBreakEvens(points: ChartPoint[]) {
  const breakEvens: number[] = [];
  const epsilon = 0.01;

  const allNearZero = points.every((point) => Math.abs(point.payoff) < epsilon);

  if (allNearZero) return [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    const previousIsZero = Math.abs(previous.payoff) < epsilon;
    const currentIsZero = Math.abs(current.payoff) < epsilon;

    if (previousIsZero && currentIsZero) continue;

    if (previousIsZero) {
      const alreadyExists = breakEvens.some(
        (price) => Math.abs(price - previous.price) < 0.05
      );

      if (!alreadyExists) breakEvens.push(previous.price);

      continue;
    }

    const changedSignal =
      (previous.payoff < 0 && current.payoff > 0) ||
      (previous.payoff > 0 && current.payoff < 0);

    if (changedSignal) {
      const distance = current.price - previous.price;
      const weight =
        Math.abs(previous.payoff) /
        (Math.abs(previous.payoff) + Math.abs(current.payoff));

      const breakEven = previous.price + distance * weight;

      const alreadyExists = breakEvens.some(
        (price) => Math.abs(price - breakEven) < 0.05
      );

      if (!alreadyExists) breakEvens.push(breakEven);
    }

    if (currentIsZero) {
      const alreadyExists = breakEvens.some(
        (price) => Math.abs(price - current.price) < 0.05
      );

      if (!alreadyExists) breakEvens.push(current.price);
    }
  }

  return breakEvens;
}

function PayoffChart({
  points,
  spot,
}: {
  points: ChartPoint[];
  spot: number;
}) {
  const width = 860;
  const height = 320;
  const padding = 38;

  const minPrice = Math.min(...points.map((point) => point.price));
  const maxPrice = Math.max(...points.map((point) => point.price));
  const minPayoff = Math.min(...points.map((point) => point.payoff), 0);
  const maxPayoff = Math.max(...points.map((point) => point.payoff), 0);

  const payoffRange = Math.max(maxPayoff - minPayoff, 1);
  const priceRange = Math.max(maxPrice - minPrice, 1);

  const xScale = (price: number) =>
    padding + ((price - minPrice) / priceRange) * (width - padding * 2);

  const yScale = (payoff: number) =>
    height -
    padding -
    ((payoff - minPayoff) / payoffRange) * (height - padding * 2);

  const path = points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";

      return `${command} ${xScale(point.price).toFixed(2)} ${yScale(
        point.payoff
      ).toFixed(2)}`;
    })
    .join(" ");

  const zeroY = yScale(0);
  const spotX = xScale(spot);

  return (
    <div style={styles.chartWrapper}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Gráfico de payoff"
      >
        <line
          x1={padding}
          y1={zeroY}
          x2={width - padding}
          y2={zeroY}
          stroke="rgba(148, 163, 184, 0.6)"
          strokeWidth="1"
        />

        <line
          x1={spotX}
          y1={padding}
          x2={spotX}
          y2={height - padding}
          stroke="rgba(148, 163, 184, 0.38)"
          strokeDasharray="5 5"
          strokeWidth="1"
        />

        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <text x={padding} y={height - 10} fontSize="12" fill="currentColor">
          {formatCurrency(minPrice)}
        </text>

        <text
          x={width - padding - 74}
          y={height - 10}
          fontSize="12"
          fill="currentColor"
        >
          {formatCurrency(maxPrice)}
        </text>

        <text x={spotX + 6} y={padding + 13} fontSize="12" fill="currentColor">
          preço atual
        </text>

        <text x={padding} y={zeroY - 8} fontSize="12" fill="currentColor">
          zero
        </text>
      </svg>
    </div>
  );
}

const initialLegs: OptionLeg[] = [
  {
    id: createId(),
    asset: "PETR4",
    optionCode: "",
    side: "BUY",
    type: "CALL",
    strike: "30",
    marketPremium: "1",
    volatility: "35",
    quantity: "1",
  },
];

export default function CalculatorPage() {
  const [asset, setAsset] = useState("PETR4");
  const [spot, setSpot] = useState("30");
  const [expirationDate, setExpirationDate] = useState(addDaysAsInputDate(30));
  const [riskFreeRate, setRiskFreeRate] = useState("10,5");
  const [dividendYield, setDividendYield] = useState("0");
  const [defaultVolatility, setDefaultVolatility] = useState("35");
  const [rangePercent, setRangePercent] = useState("40");
  const [fairValueThreshold, setFairValueThreshold] = useState(
    String(DEFAULT_FAIR_VALUE_THRESHOLD)
  );
  const [legs, setLegs] = useState<OptionLeg[]>(initialLegs);
  const [lastCalculatedAt, setLastCalculatedAt] = useState<Date | null>(null);
  const [calculationVersion, setCalculationVersion] = useState(0);

  const parsedSpot = parseDecimal(spot);
  const parsedRiskFreeRate = parseDecimal(riskFreeRate);
  const parsedDividendYield = parseDecimal(dividendYield);
  const parsedRangePercent = parseDecimal(rangePercent);
  const parsedFairValueThreshold = parseDecimal(fairValueThreshold);

  const daysToExpiration = useMemo(
    () => getDaysToExpiration(expirationDate),
    [expirationDate]
  );

  const parsedLegs = useMemo<ParsedOptionLeg[]>(
    () =>
      legs.map((leg) => ({
        id: leg.id,
        asset: leg.asset || asset,
        optionCode: leg.optionCode,
        side: leg.side,
        type: leg.type,
        strike: parseDecimal(leg.strike),
        marketPremium: Math.max(parseDecimal(leg.marketPremium), 0),
        volatility: Math.max(parseDecimal(leg.volatility), 0),
        quantity: Math.max(Math.floor(parseDecimal(leg.quantity)), 1),
      })),
    [legs, asset]
  );

  const valuationByLeg = useMemo(() => {
    return parsedLegs.map((leg) => {
      const bs = blackScholes({
        spot: parsedSpot,
        strike: leg.strike || parsedSpot,
        volatility: leg.volatility / 100,
        riskFreeRate: parsedRiskFreeRate / 100,
        dividendYield: parsedDividendYield / 100,
        daysToExpiration,
        type: leg.type,
      });

      const impliedVolatility = calculateImpliedVolatility({
        spot: parsedSpot,
        strike: leg.strike || parsedSpot,
        marketPremium: leg.marketPremium,
        riskFreeRate: parsedRiskFreeRate / 100,
        dividendYield: parsedDividendYield / 100,
        daysToExpiration,
        type: leg.type,
      });

      const difference = leg.marketPremium - bs.price;
      const differencePercent =
        bs.price > 0.0001 ? (difference / bs.price) * 100 : 0;

      const status = getPremiumStatus(
        leg.marketPremium,
        bs.price,
        parsedFairValueThreshold
      );

      const marketTotal = leg.marketPremium * leg.quantity * CONTRACT_SIZE;
      const theoreticalTotal = bs.price * leg.quantity * CONTRACT_SIZE;

      return {
        leg,
        bs,
        impliedVolatility,
        difference,
        differencePercent,
        status,
        marketTotal,
        theoreticalTotal,
      };
    });
  }, [
    parsedLegs,
    parsedSpot,
    parsedRiskFreeRate,
    parsedDividendYield,
    daysToExpiration,
    parsedFairValueThreshold,
    calculationVersion,
  ]);

  const theoreticalPricesByLeg = useMemo(() => {
    return valuationByLeg.reduce<Record<string, number>>((acc, item) => {
      acc[item.leg.id] = item.bs.price;
      return acc;
    }, {});
  }, [valuationByLeg]);

  const chartPoints = useMemo(
    () =>
      buildChartPoints(
        parsedLegs,
        parsedSpot,
        Math.max(parsedRangePercent, 5) / 100
      ),
    [parsedLegs, parsedSpot, parsedRangePercent, calculationVersion]
  );

  const summary = useMemo(() => {
    const marketEntryDebit = calculateMarketEntryDebit(parsedLegs);

    const theoreticalEntryDebit = calculateTheoreticalEntryDebit(
      parsedLegs,
      theoreticalPricesByLeg
    );

    const difference = marketEntryDebit - theoreticalEntryDebit;
    const differencePercent =
      Math.max(Math.abs(theoreticalEntryDebit), 1) > 0
        ? (difference / Math.max(Math.abs(theoreticalEntryDebit), 1)) * 100
        : 0;

    const operationStatus = getOperationStatus({
      marketEntryDebit,
      theoreticalEntryDebit,
      fairThresholdPercent: parsedFairValueThreshold,
    });

    const payoffAtSpot = parsedLegs.reduce(
      (total, leg) => total + calculateLegPayoff(leg, parsedSpot),
      0
    );

    const maxProfit = Math.max(...chartPoints.map((point) => point.payoff));
    const maxLoss = Math.min(...chartPoints.map((point) => point.payoff));
    const breakEvens = findBreakEvens(chartPoints);

    return {
      marketEntryDebit,
      theoreticalEntryDebit,
      difference,
      differencePercent,
      operationStatus,
      payoffAtSpot,
      maxProfit,
      maxLoss,
      breakEvens,
    };
  }, [
    parsedLegs,
    theoreticalPricesByLeg,
    chartPoints,
    parsedFairValueThreshold,
    parsedSpot,
    calculationVersion,
  ]);

  const recalculate = () => {
    setCalculationVersion((current) => current + 1);
    setLastCalculatedAt(new Date());
  };

  const addLeg = () => {
    setLegs((currentLegs) => [
      ...currentLegs,
      {
        id: createId(),
        asset,
        optionCode: "",
        side: "BUY",
        type: "CALL",
        strike: spot,
        marketPremium: "0",
        volatility: defaultVolatility,
        quantity: "1",
      },
    ]);
  };

  const removeLeg = (id: string) => {
    setLegs((currentLegs) => currentLegs.filter((leg) => leg.id !== id));
  };

  const updateLeg = <K extends keyof OptionLeg>(
    id: string,
    field: K,
    value: OptionLeg[K]
  ) => {
    setLegs((currentLegs) =>
      currentLegs.map((leg) =>
        leg.id === id ? { ...leg, [field]: value } : leg
      )
    );
  };

  const fillPremiumWithBlackScholes = (id: string) => {
    const valuation = valuationByLeg.find((item) => item.leg.id === id);

    if (!valuation) return;

    setLegs((currentLegs) =>
      currentLegs.map((leg) =>
        leg.id === id
          ? {
              ...leg,
              marketPremium: valuation.bs.price.toFixed(2).replace(".", ","),
            }
          : leg
      )
    );

    setLastCalculatedAt(new Date());
  };

  const fillAllPremiumsWithBlackScholes = () => {
    setLegs((currentLegs) =>
      currentLegs.map((leg) => {
        const valuation = valuationByLeg.find((item) => item.leg.id === leg.id);

        if (!valuation) return leg;

        return {
          ...leg,
          marketPremium: valuation.bs.price.toFixed(2).replace(".", ","),
        };
      })
    );

    setLastCalculatedAt(new Date());
  };

  const useImpliedVolatilityInLeg = (id: string) => {
  const valuation = valuationByLeg.find((item) => item.leg.id === id);

  if (!valuation || valuation.impliedVolatility === null) return;

  const impliedVolatility = valuation.impliedVolatility;

  setLegs((currentLegs) =>
    currentLegs.map((leg) =>
      leg.id === id
        ? {
            ...leg,
            volatility: (impliedVolatility * 100)
              .toFixed(2)
              .replace(".", ","),
          }
        : leg
    )
  );

  setLastCalculatedAt(new Date());
};

  const applyDefaultVolatilityToAllLegs = () => {
    setLegs((currentLegs) =>
      currentLegs.map((leg) => ({
        ...leg,
        volatility: defaultVolatility,
      }))
    );

    setLastCalculatedAt(new Date());
  };

  return (
    <Layout>
      <main style={styles.page}>
        <section style={styles.headerCard}>
          <div>
            <p style={styles.eyebrow}>Options Terminal</p>
            <h1 style={styles.title}>Calculadora de Opções</h1>
            <p style={styles.subtitle}>
              Compare o prêmio atual da opção contra Black-Scholes, calcule a
              volatilidade implícita e veja se a opção ou a estrutura está
              barata, cara ou justa.
            </p>
          </div>

          <div style={styles.headerActions}>
            {lastCalculatedAt && (
              <span style={styles.lastCalculation}>
                Atualizado às{" "}
                {lastCalculatedAt.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}

            <button
              style={styles.primaryButton}
              type="button"
              onClick={recalculate}
            >
              Recalcular
            </button>

            <div
              style={{
                ...styles.statusBadge,
                ...getStatusStyle(summary.operationStatus),
              }}
            >
              Operação {getStatusLabel(summary.operationStatus)}
            </div>
          </div>
        </section>

        <section style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.cardTitle}>Dados do ativo e do modelo</h2>
                <p style={styles.sectionText}>
                  Esses dados são compartilhados pelas pernas da operação.
                </p>
              </div>
            </div>

            <div style={styles.formGrid}>
              <label style={styles.label}>
                Nome do ativo
                <input
                  style={styles.input}
                  value={asset}
                  placeholder="PETR4"
                  onChange={(event) =>
                    setAsset(event.target.value.toUpperCase())
                  }
                />
              </label>

              <label style={styles.label}>
                Preço atual do ativo
                <input
                  style={styles.input}
                  type="text"
                  inputMode="decimal"
                  value={spot}
                  placeholder="Ex: 40,36"
                  onChange={(event) => setSpot(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Data de vencimento
                <input
                  style={styles.input}
                  type="date"
                  value={expirationDate}
                  onChange={(event) => setExpirationDate(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Dias até o vencimento
                <input
                  style={{ ...styles.input, opacity: 0.72 }}
                  type="number"
                  value={daysToExpiration}
                  readOnly
                />
              </label>

              <label style={styles.label}>
                Volatilidade padrão %
                <input
                  style={styles.input}
                  type="text"
                  inputMode="decimal"
                  value={defaultVolatility}
                  placeholder="Ex: 35"
                  onChange={(event) => setDefaultVolatility(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Taxa livre de risco anual %
                <input
                  style={styles.input}
                  type="text"
                  inputMode="decimal"
                  value={riskFreeRate}
                  placeholder="Ex: 10,5"
                  onChange={(event) => setRiskFreeRate(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Dividend yield anual %
                <input
                  style={styles.input}
                  type="text"
                  inputMode="decimal"
                  value={dividendYield}
                  placeholder="Ex: 0"
                  onChange={(event) => setDividendYield(event.target.value)}
                />
              </label>

              <label style={styles.label}>
                Margem para considerar justo %
                <input
                  style={styles.input}
                  type="text"
                  inputMode="decimal"
                  value={fairValueThreshold}
                  placeholder="Ex: 5"
                  onChange={(event) =>
                    setFairValueThreshold(event.target.value)
                  }
                />
              </label>

              <label style={styles.label}>
                Faixa do gráfico %
                <input
                  style={styles.input}
                  type="text"
                  inputMode="decimal"
                  value={rangePercent}
                  placeholder="Ex: 40"
                  onChange={(event) => setRangePercent(event.target.value)}
                />
              </label>
            </div>

            <div style={styles.modelActions}>
              <button
                style={styles.secondaryButton}
                type="button"
                onClick={applyDefaultVolatilityToAllLegs}
              >
                Aplicar volatilidade padrão nas pernas
              </button>
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Resumo da estrutura</h2>

            <div style={styles.summaryGrid}>
              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Custo mercado</span>
                <strong style={styles.metricValue}>
                  {formatCurrency(summary.marketEntryDebit)}
                </strong>
                <small style={styles.metricHint}>
                  Positivo = débito | Negativo = crédito
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Valor teórico</span>
                <strong style={styles.metricValue}>
                  {formatCurrency(summary.theoreticalEntryDebit)}
                </strong>
                <small style={styles.metricHint}>
                  Estrutura precificada por Black-Scholes
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Diferença</span>
                <strong style={styles.metricValue}>
                  {formatCurrency(summary.difference)}
                </strong>
                <small style={styles.metricHint}>
                  {formatNumber(summary.differencePercent, 2)}%
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Resultado no preço atual</span>
                <strong style={styles.metricValue}>
                  {formatCurrency(summary.payoffAtSpot)}
                </strong>
                <small style={styles.metricHint}>Payoff no vencimento</small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Lucro máximo simulado</span>
                <strong style={styles.metricValue}>
                  {formatCurrency(summary.maxProfit)}
                </strong>
                <small style={styles.metricHint}>
                  Dentro da faixa do gráfico
                </small>
              </div>

              <div style={styles.metricBox}>
                <span style={styles.metricLabel}>Prejuízo máximo simulado</span>
                <strong style={styles.metricValue}>
                  {formatCurrency(summary.maxLoss)}
                </strong>
                <small style={styles.metricHint}>
                  Dentro da faixa do gráfico
                </small>
              </div>
            </div>

            <div
              style={{
                ...styles.operationDecisionBox,
                ...getStatusStyle(summary.operationStatus),
              }}
            >
              <strong>Operação {getStatusLabel(summary.operationStatus)}</strong>
              <span>{getOperationInterpretation(summary.operationStatus)}</span>
            </div>

            <div style={styles.breakEvenBox}>
              <span style={styles.metricLabel}>
                Ponto(s) de equilíbrio aproximado(s)
              </span>

              <strong style={styles.breakEvenText}>
                {summary.breakEvens.length > 0
                  ? summary.breakEvens
                      .map((price) => formatCurrency(price))
                      .join(" | ")
                  : "Não encontrado na faixa simulada"}
              </strong>
            </div>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.cardTitle}>Pernas da operação</h2>
              <p style={styles.sectionText}>
                Aqui você informa o prêmio atual da opção. O sistema calcula o
                preço teórico e a volatilidade implícita.
              </p>
            </div>

            <div style={styles.buttonsGroup}>
              <button
                style={styles.secondaryButton}
                type="button"
                onClick={fillAllPremiumsWithBlackScholes}
              >
                Usar BS em todas
              </button>

              <button
                style={styles.primaryButton}
                type="button"
                onClick={addLeg}
              >
                + Adicionar perna
              </button>
            </div>
          </div>

          <div style={styles.legsList}>
            {valuationByLeg.map((item) => {
              const {
                leg,
                bs,
                impliedVolatility,
                difference,
                differencePercent,
                status,
              } = item;

              const editableLeg = legs.find(
                (currentLeg) => currentLeg.id === leg.id
              );

              if (!editableLeg) return null;

              const favorableForOrder =
                (leg.side === "BUY" && status === "CHEAP") ||
                (leg.side === "SELL" && status === "EXPENSIVE");

              const unfavorableForOrder =
                (leg.side === "BUY" && status === "EXPENSIVE") ||
                (leg.side === "SELL" && status === "CHEAP");

              return (
                <div key={leg.id} style={styles.legCard}>
                  <div style={styles.legTopLine}>
                    <div>
                      <strong>
                        {leg.optionCode || "Sem código"} ·{" "}
                        {getSideLabel(leg.side)} de {getTypeLabel(leg.type)}
                      </strong>

                      <p style={styles.legSubtitle}>
                        {leg.asset || asset} · Strike{" "}
                        {formatCurrency(leg.strike)} · {leg.quantity}{" "}
                        contrato(s)
                      </p>
                    </div>

                    <div
                      style={{
                        ...styles.statusBadge,
                        ...getStatusStyle(status),
                      }}
                    >
                      Opção {getStatusLabel(status)}
                    </div>
                  </div>

                  <div style={styles.legGrid}>
                    <label style={styles.label}>
                      Ativo
                      <input
                        style={styles.input}
                        value={editableLeg.asset}
                        placeholder="PETR4"
                        onChange={(event) =>
                          updateLeg(
                            leg.id,
                            "asset",
                            event.target.value.toUpperCase()
                          )
                        }
                      />
                    </label>

                    <label style={styles.label}>
                      Código da opção
                      <input
                        style={styles.input}
                        value={editableLeg.optionCode}
                        placeholder="PETRF414"
                        onChange={(event) =>
                          updateLeg(
                            leg.id,
                            "optionCode",
                            event.target.value.toUpperCase()
                          )
                        }
                      />
                    </label>

                    <label style={styles.label}>
                      Lado
                      <select
                        style={styles.input}
                        value={editableLeg.side}
                        onChange={(event) =>
                          updateLeg(
                            leg.id,
                            "side",
                            event.target.value as LegSide
                          )
                        }
                      >
                        <option value="BUY">Compra</option>
                        <option value="SELL">Venda</option>
                      </select>
                    </label>

                    <label style={styles.label}>
                      Tipo
                      <select
                        style={styles.input}
                        value={editableLeg.type}
                        onChange={(event) =>
                          updateLeg(
                            leg.id,
                            "type",
                            event.target.value as OptionType
                          )
                        }
                      >
                        <option value="CALL">Call</option>
                        <option value="PUT">Put</option>
                      </select>
                    </label>

                    <label style={styles.label}>
                      Strike
                      <input
                        style={styles.input}
                        type="text"
                        inputMode="decimal"
                        value={editableLeg.strike}
                        placeholder="Ex: 40,36"
                        onChange={(event) =>
                          updateLeg(leg.id, "strike", event.target.value)
                        }
                      />
                    </label>

                    <label style={styles.label}>
                      Prêmio atual da opção
                      <input
                        style={styles.input}
                        type="text"
                        inputMode="decimal"
                        value={editableLeg.marketPremium}
                        placeholder="Ex: 1,25"
                        onChange={(event) =>
                          updateLeg(leg.id, "marketPremium", event.target.value)
                        }
                      />
                    </label>

                    <label style={styles.label}>
                      Volatilidade usada %
                      <input
                        style={styles.input}
                        type="text"
                        inputMode="decimal"
                        value={editableLeg.volatility}
                        placeholder="Ex: 35"
                        onChange={(event) =>
                          updateLeg(leg.id, "volatility", event.target.value)
                        }
                      />
                    </label>

                    <label style={styles.label}>
                      Quantidade
                      <input
                        style={styles.input}
                        type="number"
                        min="1"
                        step="1"
                        value={editableLeg.quantity}
                        onChange={(event) =>
                          updateLeg(leg.id, "quantity", event.target.value)
                        }
                      />
                    </label>
                  </div>

                  <div style={styles.valuationGrid}>
                    <div style={styles.metricBox}>
                      <span style={styles.metricLabel}>Prêmio mercado</span>
                      <strong style={styles.metricValue}>
                        {formatOptionCurrency(leg.marketPremium)}
                      </strong>
                      <small style={styles.metricHint}>
                        Preço atual da opção informado por você
                      </small>
                    </div>

                    <div style={styles.metricBox}>
                      <span style={styles.metricLabel}>Preço teórico BS</span>
                      <strong style={styles.metricValue}>
                        {formatOptionCurrency(bs.price)}
                      </strong>
                      <small style={styles.metricHint}>
                        Calculado com a volatilidade usada
                      </small>
                    </div>

                    <div style={styles.metricBox}>
                      <span style={styles.metricLabel}>
                        Volatilidade implícita
                      </span>
                      <strong style={styles.metricValue}>
                        {impliedVolatility !== null
                          ? formatPercent(impliedVolatility)
                          : "Não calculada"}
                      </strong>
                      <small style={styles.metricHint}>
                        Extraída do prêmio de mercado
                      </small>
                    </div>

                    <div style={styles.metricBox}>
                      <span style={styles.metricLabel}>Diferença</span>
                      <strong style={styles.metricValue}>
                        {formatOptionCurrency(difference)}
                      </strong>
                      <small style={styles.metricHint}>
                        {formatNumber(differencePercent, 2)}%
                      </small>
                    </div>

                    <div style={styles.metricBox}>
                      <span style={styles.metricLabel}>Gregas</span>
                      <strong style={styles.greeksText}>
                        Δ {bs.delta.toFixed(3)} · Γ {bs.gamma.toFixed(3)}
                      </strong>
                      <small style={styles.metricHint}>
                        Vega {formatOptionCurrency(bs.vega)} · Theta{" "}
                        {formatOptionCurrency(bs.theta)}
                      </small>
                    </div>

                    <div style={styles.metricBox}>
                      <span style={styles.metricLabel}>Impacto na ordem</span>
                      <strong style={styles.metricValue}>
                        {status === "FAIR"
                          ? "Neutro"
                          : favorableForOrder
                          ? "Favorável"
                          : unfavorableForOrder
                          ? "Desfavorável"
                          : "Neutro"}
                      </strong>
                      <small style={styles.metricHint}>
                        {leg.side === "BUY"
                          ? "Compra prefere opção barata"
                          : "Venda prefere opção cara"}
                      </small>
                    </div>

                    <div style={styles.metricBox}>
                      <span style={styles.metricLabel}>Total da perna</span>
                      <strong style={styles.metricValue}>
                        {formatCurrency(
                          leg.marketPremium * leg.quantity * CONTRACT_SIZE
                        )}
                      </strong>
                      <small style={styles.metricHint}>
                        {leg.quantity} × 100 opções
                      </small>
                    </div>
                  </div>

                  <div style={styles.legActions}>
                    <button
                      style={styles.secondaryButton}
                      type="button"
                      onClick={() => fillPremiumWithBlackScholes(leg.id)}
                    >
                      Usar preço BS nessa perna
                    </button>

                    <button
                      style={styles.secondaryButton}
                      type="button"
                      onClick={() => useImpliedVolatilityInLeg(leg.id)}
                    >
                      Usar vol. implícita
                    </button>

                    <button
                      style={styles.primaryButton}
                      type="button"
                      onClick={recalculate}
                    >
                      Recalcular perna
                    </button>

                    <button
                      style={styles.dangerButton}
                      type="button"
                      onClick={() => removeLeg(leg.id)}
                      disabled={legs.length === 1}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.cardTitle}>Gráfico de payoff</h2>
              <p style={styles.sectionText}>
                Resultado estimado da estrutura no vencimento usando os prêmios
                atuais preenchidos nas pernas.
              </p>
            </div>

            <div style={styles.legendBox}>
              <span>Ativo: {asset}</span>
              <span>Preço: {formatCurrency(parsedSpot)}</span>
              <span>Taxa: {formatPercent(parsedRiskFreeRate / 100)}</span>
              <span>
                Dividendos: {formatPercent(parsedDividendYield / 100)}
              </span>
              <span>Venc.: {daysToExpiration} dias</span>
            </div>
          </div>

          <PayoffChart points={chartPoints} spot={parsedSpot} />
        </section>

        <section style={styles.warningBox}>
          <strong>Importante:</strong> Black-Scholes é um modelo teórico. Ele
          ajuda a comparar preço, mas não garante que a opção esteja realmente
          errada. Volatilidade, liquidez, spread, dividendos, exercício e eventos
          relevantes podem distorcer bastante o preço de mercado.
        </section>
      </main>
    </Layout>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    padding: "24px",
    color: "var(--text-main, #e5e7eb)",
  },

  headerCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    padding: "24px",
    borderRadius: "20px",
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.22))",
    background: "var(--bg-card, rgba(15, 23, 42, 0.92))",
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
  },

  lastCalculation: {
    color: "var(--text-muted, #94a3b8)",
    fontSize: "12px",
  },

  eyebrow: {
    margin: 0,
    color: "var(--text-muted, #94a3b8)",
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },

  title: {
    margin: "6px 0 8px",
    fontSize: "32px",
    lineHeight: 1.1,
  },

  subtitle: {
    margin: 0,
    color: "var(--text-muted, #94a3b8)",
    maxWidth: "760px",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 0.85fr)",
    gap: "24px",
  },

  card: {
    padding: "22px",
    borderRadius: "20px",
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.22))",
    background: "var(--bg-card, rgba(15, 23, 42, 0.92))",
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.16)",
  },

  cardTitle: {
    margin: "0 0 8px",
    fontSize: "20px",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
  },

  label: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    color: "var(--text-muted, #94a3b8)",
    fontSize: "13px",
    fontWeight: 600,
  },

  input: {
    width: "100%",
    minHeight: "42px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.28))",
    background: "var(--bg-main, #020617)",
    color: "var(--text-main, #e5e7eb)",
    outline: "none",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "16px",
  },

  sectionText: {
    margin: 0,
    color: "var(--text-muted, #94a3b8)",
    fontSize: "14px",
  },

  modelActions: {
    marginTop: "16px",
    display: "flex",
    justifyContent: "flex-end",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },

  metricBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px",
    borderRadius: "16px",
    background: "rgba(148, 163, 184, 0.08)",
  },

  metricLabel: {
    color: "var(--text-muted, #94a3b8)",
    fontSize: "12px",
  },

  metricValue: {
    fontSize: "18px",
  },

  metricHint: {
    color: "var(--text-muted, #94a3b8)",
    fontSize: "12px",
  },

  operationDecisionBox: {
    marginTop: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px",
    borderRadius: "16px",
    fontSize: "14px",
  },

  breakEvenBox: {
    marginTop: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px",
    borderRadius: "16px",
    background: "rgba(148, 163, 184, 0.08)",
  },

  breakEvenText: {
    fontSize: "16px",
  },

  buttonsGroup: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },

  primaryButton: {
    border: 0,
    borderRadius: "12px",
    padding: "11px 16px",
    background: "var(--accent, #38bdf8)",
    color: "#020617",
    fontWeight: 800,
    cursor: "pointer",
  },

  secondaryButton: {
    border: "1px solid var(--border-color, rgba(148, 163, 184, 0.28))",
    borderRadius: "12px",
    padding: "10px 12px",
    background: "transparent",
    color: "var(--text-main, #e5e7eb)",
    fontWeight: 700,
    cursor: "pointer",
  },

  dangerButton: {
    border: "1px solid rgba(248, 113, 113, 0.35)",
    borderRadius: "12px",
    padding: "10px 12px",
    background: "rgba(248, 113, 113, 0.08)",
    color: "#fecaca",
    fontWeight: 700,
    cursor: "pointer",
  },

  legsList: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },

  legCard: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    padding: "16px",
    borderRadius: "18px",
    background: "rgba(148, 163, 184, 0.07)",
    border: "1px solid rgba(148, 163, 184, 0.16)",
  },

  legTopLine: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },

  legSubtitle: {
    margin: "4px 0 0",
    color: "var(--text-muted, #94a3b8)",
    fontSize: "13px",
  },

  legGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
  },

  valuationGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "12px",
  },

  greeksText: {
    fontSize: "14px",
  },

  legActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
  },

  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "120px",
    padding: "9px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  legendBox: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    color: "var(--text-muted, #94a3b8)",
    fontSize: "13px",
  },

  chartWrapper: {
    width: "100%",
    overflowX: "auto",
    color: "var(--accent, #38bdf8)",
  },

  warningBox: {
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid rgba(234, 179, 8, 0.35)",
    background: "rgba(234, 179, 8, 0.1)",
    color: "#fde68a",
    fontSize: "14px",
    lineHeight: 1.5,
  },
};