import { BaseMCP, MCPConfig, MCPResponse } from './base-mcp';

export interface WeatherData {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  icon: string;
  location: {
    name: string;
    country: string;
    lat: number;
    lon: number;
  };
  forecast?: {
    date: string;
    temperature: {
      min: number;
      max: number;
    };
    description: string;
    icon: string;
  }[];
}

export interface WeatherRequest {
  lat: number;
  lon: number;
  units?: 'metric' | 'imperial' | 'kelvin';
  includeForecast?: boolean;
  days?: number;
}

export class WeatherMCP extends BaseMCP {
  constructor(config: MCPConfig) {
    super(config);
  }

  getServiceName(): string {
    return 'OpenWeatherMap';
  }

  async healthCheck(): Promise<MCPResponse<{ status: string }>> {
    try {
      const response = await this.makeRequest<any>(
        `${this.config.baseUrl}/weather?q=London&appid=${this.config.apiKey}`,
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

  async getCurrentWeather(request: WeatherRequest): Promise<MCPResponse<WeatherData>> {
    const { lat, lon, units = 'metric' } = request;
    
    const url = `${this.config.baseUrl}/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${this.config.apiKey}`;
    
    const response = await this.makeRequest<any>(url, { method: 'GET' }, `weather-${lat}-${lon}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    const weatherData: WeatherData = {
      temperature: data.main.temp,
      description: data.weather[0].description,
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      icon: data.weather[0].icon,
      location: {
        name: data.name,
        country: data.sys.country,
        lat: data.coord.lat,
        lon: data.coord.lon,
      },
    };

    // Add forecast if requested
    if (request.includeForecast) {
      const forecastResponse = await this.getForecast({
        lat,
        lon,
        units,
        days: request.days || 5,
      });
      
      if (forecastResponse.success && forecastResponse.data) {
        weatherData.forecast = forecastResponse.data.forecast;
      }
    }

    return {
      success: true,
      data: weatherData,
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async getForecast(request: WeatherRequest): Promise<MCPResponse<Pick<WeatherData, 'forecast'>>> {
    const { lat, lon, units = 'metric', days = 5 } = request;
    
    const url = `${this.config.baseUrl}/forecast?lat=${lat}&lon=${lon}&units=${units}&cnt=${days * 8}&appid=${this.config.apiKey}`;
    
    const response = await this.makeRequest<any>(url, { method: 'GET' }, `forecast-${lat}-${lon}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    // Group forecast data by day
    const forecastByDay: Record<string, any[]> = {};
    
    data.list.forEach((item: any) => {
      const date = new Date(item.dt * 1000).toISOString().split('T')[0];
      if (!forecastByDay[date]) {
        forecastByDay[date] = [];
      }
      forecastByDay[date].push(item);
    });

    const forecast = Object.entries(forecastByDay).map(([date, items]) => {
      const temperatures = items.map(item => item.main.temp);
      const descriptions = items.map(item => item.weather[0].description);
      const icons = items.map(item => item.weather[0].icon);
      
      return {
        date,
        temperature: {
          min: Math.min(...temperatures),
          max: Math.max(...temperatures),
        },
        description: descriptions[0], // Use first description of the day
        icon: icons[0], // Use first icon of the day
      };
    });

    return {
      success: true,
      data: { forecast },
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }

  async getWeatherByCity(city: string, units: 'metric' | 'imperial' | 'kelvin' = 'metric'): Promise<MCPResponse<WeatherData>> {
    const url = `${this.config.baseUrl}/weather?q=${encodeURIComponent(city)}&units=${units}&appid=${this.config.apiKey}`;
    
    const response = await this.makeRequest<any>(url, { method: 'GET' }, `weather-city-${city}`);
    
    if (!response.success) {
      return response;
    }

    const data = response.data;
    
    return {
      success: true,
      data: {
        temperature: data.main.temp,
        description: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: data.wind.speed,
        icon: data.weather[0].icon,
        location: {
          name: data.name,
          country: data.sys.country,
          lat: data.coord.lat,
          lon: data.coord.lon,
        },
      },
      metadata: {
        timestamp: new Date(),
        source: this.getServiceName(),
      },
    };
  }
}
