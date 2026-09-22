import { Activity, Cpu, FileText, Zap } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Progress } from '@/components/ui/progress'
import { useChartVisibility } from '@/contexts/chart-visibility-context'
import { ChartHint } from './chart-hint'
import {
  createRagResponseTimeChartConfig,
  createTokenUsageChartConfig,
} from './constants'
import { type MetricsResponse } from './types'
import { formatShortDate } from './utils'

interface RAGQualityMetricsProps {
  metrics: MetricsResponse
}

export function RAGQualityMetrics({
  metrics,
}: Readonly<RAGQualityMetricsProps>) {
  const locale = useLocale()
  const t = useTranslations('RAGQualityMetrics')

  const {
    state: { visibility },
  } = useChartVisibility()
  const ragQuality = metrics.rag_quality

  const ragResponseTimeChartConfig = useMemo(
    () =>
      createRagResponseTimeChartConfig({
        turn: t('chartLabels.turnMs'),
        retrieval: t('chartLabels.retrievalMs'),
      }),
    [t],
  )
  const tokenUsageChartConfig = useMemo(
    () =>
      createTokenUsageChartConfig({
        input: t('chartLabels.input'),
        output: t('chartLabels.output'),
      }),
    [t],
  )

  const responseTimeData = useMemo(
    () =>
      ragQuality.response_time_trend.map((item) => ({
        ...item,
        date: formatShortDate(item.date, locale),
        turn_ms: item.turn_response_time * 1000,
        doc_ms: item.doc_response_time * 1000,
      })),
    [locale, ragQuality.response_time_trend],
  )

  const tokenData = useMemo(
    () => [
      {
        name: 'LLM',
        input: ragQuality.token_usage.llm_tokens_in,
        output: ragQuality.token_usage.llm_tokens_out,
      },
      {
        name: 'RAG',
        input: ragQuality.token_usage.rag_tokens_in,
        output: ragQuality.token_usage.rag_tokens_out,
      },
    ],
    [ragQuality.token_usage],
  )

  const totalTokens =
    ragQuality.token_usage.llm_tokens_in +
    ragQuality.token_usage.llm_tokens_out +
    ragQuality.token_usage.rag_tokens_in +
    ragQuality.token_usage.rag_tokens_out

  const systemHealth = ragQuality.system_health
  // A resource with no samples reads as null, which is not the same as a
  // resource measured at 0% -- a machine with no GPU must say so.
  const resources = useMemo(
    () => [
      {
        key: 'cpu' as const,
        average: systemHealth.avg_cpu,
        max: systemHealth.max_cpu,
      },
      {
        key: 'ram' as const,
        average: systemHealth.avg_ram,
        max: systemHealth.max_ram,
      },
      {
        key: 'gpu' as const,
        average: systemHealth.avg_gpu,
        max: systemHealth.max_gpu,
      },
    ],
    [systemHealth],
  )
  const hasSystemData = resources.some((resource) => resource.average !== null)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">{t('title')}</h2>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {visibility.responseTimeTrend && responseTimeData.length > 0 && (
          <Card className="bg-card/60 border-border/50 hover:shadow-primary/5 overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:shadow-lg lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center text-xl font-bold tracking-tight">
                  {t('responseTimeTrend.title')}
                  <ChartHint hint={t('responseTimeTrend.hint')} />
                </CardTitle>
                <CardDescription>
                  {t('responseTimeTrend.description')}
                </CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Zap size={20} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={ragResponseTimeChartConfig}
                className="h-[300px] w-full"
              >
                <AreaChart
                  data={responseTimeData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillTurn" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-turn_ms)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-turn_ms)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient id="fillDoc" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-doc_ms)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-doc_ms)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    style={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    style={{ fontSize: 11 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="turn_ms"
                    stroke="var(--color-turn_ms)"
                    fill="url(#fillTurn)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="doc_ms"
                    stroke="var(--color-doc_ms)"
                    fill="url(#fillDoc)"
                    strokeWidth={2}
                  />
                  <ChartLegend
                    content={<ChartLegendContent />}
                    className="pt-4"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.tokenUsage && (
          <Card className="bg-card/60 border-border/50 hover:shadow-primary/5 overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center text-lg font-bold">
                  {t('tokenUsage.title')}
                  <ChartHint hint={t('tokenUsage.hint')} />
                </CardTitle>
                <CardDescription>
                  {t('tokenUsage.total', {
                    count: totalTokens.toLocaleString(locale),
                  })}
                </CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Activity size={18} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={tokenUsageChartConfig}
                className="h-[250px] w-full"
              >
                <BarChart
                  data={tokenData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 12, fontWeight: 600 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 11 }}
                    tickFormatter={(value) =>
                      value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value
                    }
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                    }
                  />
                  <Bar
                    dataKey="input"
                    fill="var(--color-input)"
                    radius={[6, 6, 0, 0]}
                    barSize={50}
                  />
                  <Bar
                    dataKey="output"
                    fill="var(--color-output)"
                    radius={[6, 6, 0, 0]}
                    barSize={50}
                  />
                  <ChartLegend
                    content={<ChartLegendContent />}
                    className="pt-4"
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.resourceConsumption && (
          <Card className="bg-card/60 border-border/50 hover:shadow-primary/5 rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center text-lg font-bold">
                  {t('systemHealth.title')}
                  <ChartHint hint={t('systemHealth.hint')} />
                </CardTitle>
                <CardDescription>
                  {t('systemHealth.description')}
                </CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Cpu size={18} />
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              {hasSystemData ? (
                resources.map(({ key, average, max }) => (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {t(`resources.${key}`)}
                      </span>
                      <span className="text-muted-foreground">
                        {average === null
                          ? t('resources.notSampled')
                          : t('resources.usageWithMax', {
                              average: average.toFixed(1),
                              max: (max ?? average).toFixed(1),
                            })}
                      </span>
                    </div>
                    <Progress value={average ?? 0} className="h-2" />
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  {t('systemHealth.noData')}
                </p>
              )}

              <div className="border-border mt-4 border-t pt-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary rounded-lg p-2">
                    <FileText size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {t('chunksPerSearch.title')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('chunksPerSearch.description')}
                    </p>
                  </div>
                  <div className="ml-auto text-2xl font-bold">
                    {ragQuality.avg_chunks_per_query.toFixed(1)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
