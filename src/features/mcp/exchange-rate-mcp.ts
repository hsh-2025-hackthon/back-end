import { BaseMCP, MCPConfig, MCPResponse } from './base-mcp';

export interface ExchangeRateData {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  lastUpdated: Date;
  historical?: {
    date: string;
    rate: number;
  }[];
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  country: string;
}

export interface ExchangeRateRequest {
  from: string;
  to: string;
  amount?: number;
  historical?: boolean;
  days?: number;
}

export class ExchangeRateMCP extends BaseMCP {
  private currencyCache: Map<string, CurrencyInfo> = new Map();

  constructor(config: MCPConfig) {
    super(config);
    this.initializeCurrencies();
  }

  getServiceName(): string {
    return 'ExchangeRateAPI';
  }

  private initializeCurrencies(): void {
    const currencies: CurrencyInfo[] = [
      { code: 'USD', name: 'US Dollar', symbol: '$', country: 'United States' },
      { code: 'EUR', name: 'Euro', symbol: '€', country: 'European Union' },
      { code: 'GBP', name: 'British Pound', symbol: '£', country: 'United Kingdom' },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', country: 'Japan' },
      { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', country: 'Australia' },
      { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', country: 'Canada' },
      { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', country: 'Switzerland' },
      { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', country: 'China' },
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', country: 'India' },
      { code: 'KRW', name: 'South Korean Won', symbol: '₩', country: 'South Korea' },
      { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', country: 'Singapore' },
      { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', country: 'Hong Kong' },
      { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', country: 'New Zealand' },
      { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', country: 'Sweden' },
      { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', country: 'Norway' },
      { code: 'MXN', name: 'Mexican Peso', symbol: '$', country: 'Mexico' },
      { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', country: 'Brazil' },
      { code: 'RUB', name: 'Russian Ruble', symbol: '₽', country: 'Russia' },
      { code: 'ZAR', name: 'South African Rand', symbol: 'R', country: 'South Africa' },
      { code: 'TRY', name: 'Turkish Lira', symbol: '₺', country: 'Turkey' },
    ];

    currencies.forEach(currency => {
      this.currencyCache.set(currency.code, currency);
    });
  }

  async healthCheck(): Promise<MCPResponse<{ status: string }>> {
    try {
      const response = await this.makeRequest<any>(
        `${this.config.baseUrl}/latest?access_key=${this.config.apiKey}&symbols=USD,EUR`,
        { method: 'GET' },
        'health-check'
      );

      if (response.success) {
        return {
          success: true,
          data: { status: 'healthy' },
          metadata: {
            timestamp: new Date(),
            source: this.getServiceName(),
          },
        };
      }

      return {
        success: false,
        error: 'Health check failed',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Health check failed',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }
  }

  async getExchangeRate(request: ExchangeRateRequest): Promise<MCPResponse<ExchangeRateData>> {
    const { from, to, historical = false, days = 7 } = request;
    
    // Validate currency codes
    if (!this.currencyCache.has(from.toUpperCase()) || !this.currencyCache.has(to.toUpperCase())) {
      return {
        success: false,
        error: 'Invalid currency code',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();

    // Get current exchange rate
    const url = `${this.config.baseUrl}/latest?access_key=${this.config.apiKey}&base=${fromCode}&symbols=${toCode}`;
    
    const response = await this.makeRequest<any>(url, { method: 'GET' }, `rate-${fromCode}-${toCode}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    if (!data.success || !data.rates || !data.rates[toCode]) {
      return {
        success: false,
        error: 'Exchange rate not available',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    const exchangeRateData: ExchangeRateData = {
      baseCurrency: fromCode,
      targetCurrency: toCode,
      rate: data.rates[toCode],
      lastUpdated: new Date(data.timestamp * 1000),
    };

    // Add historical data if requested
    if (historical) {
      const historicalData = await this.getHistoricalRates(fromCode, toCode, days);
      if (historicalData.success && historicalData.data) {
        exchangeRateData.historical = historicalData.data;
      }
    }

    return {
      success: true,
      data: exchangeRateData,
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  private async getHistoricalRates(from: string, to: string, days: number): Promise<MCPResponse<{ date: string; rate: number }[]>> {
    const historicalRates: { date: string; rate: number }[] = [];
    
    // Get historical data for the specified number of days
    for (let i = 1; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      try {
        const url = `${this.config.baseUrl}/${dateStr}?access_key=${this.config.apiKey}&base=${from}&symbols=${to}`;
        
        const response = await this.makeRequest<any>(url, { method: 'GET' }, `historical-${from}-${to}-${dateStr}`);
        
        if (response.success && response.data?.rates?.[to]) {
          historicalRates.push({
            date: dateStr,
            rate: response.data.rates[to],
          });
        }
      } catch (error) {
        // Continue even if one day fails
        console.warn(`[ExchangeRateMCP] Failed to get historical rate for ${dateStr}:`, error);
      }
    }

    return {
      success: true,
      data: historicalRates.reverse(), // Sort chronologically
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async convertCurrency(from: string, to: string, amount: number): Promise<MCPResponse<{ amount: number; convertedAmount: number; rate: number }>> {
    const rateResponse = await this.getExchangeRate({ from, to });
    
    if (!rateResponse.success || !rateResponse.data) {
      return {
        success: false,
        error: rateResponse.error || 'Failed to get exchange rate',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    const rate = rateResponse.data.rate;
    const convertedAmount = amount * rate;

    return {
      success: true,
      data: {
        amount,
        convertedAmount: Math.round(convertedAmount * 100) / 100, // Round to 2 decimal places
        rate,
      },
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async getSupportedCurrencies(): Promise<MCPResponse<CurrencyInfo[]>> {
    return {
      success: true,
      data: Array.from(this.currencyCache.values()),
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async getCurrencyInfo(code: string): Promise<MCPResponse<CurrencyInfo>> {
    const currency = this.currencyCache.get(code.toUpperCase());
    
    if (!currency) {
      return {
        success: false,
        error: 'Currency not supported',
        metadata: {
          timestamp: new Date(),
          source: this.getServiceName(),
        },
      };
    }

    return {
      success: true,
      data: currency,
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }
}
