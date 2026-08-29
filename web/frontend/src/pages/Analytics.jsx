import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthContext } from '../hooks/useAuthContext'
import { useTheme as useAppTheme } from '../hooks/useTheme'
import dayjs from 'dayjs'
import ReactECharts from 'echarts-for-react'

import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Button from '@mui/material/Button'

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { DataGrid } from '@mui/x-data-grid'

import { Activity, TrendingUp, TrendingDown, Minus, Clock, ShieldCheck, Download } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { CATEGORY_COLORS } from '../utils/airQualityGuidance'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Pollutant metadata: label + unit for tables/charts.
const POLLUTANTS = [
  { key: 'Aqi', label: 'AQI', unit: '' },
  { key: 'PM25', label: 'PM 2.5', unit: 'µg/m³' },
  { key: 'PM10', label: 'PM 10', unit: 'µg/m³' },
  { key: 'PM1', label: 'PM 1.0', unit: 'µg/m³' },
  { key: 'CO2', label: 'CO₂', unit: 'ppm' },
  { key: 'TVOC', label: 'TVOC', unit: 'µg/m³' },
  { key: 'Formaldehyde', label: 'HCHO', unit: 'µg/m³' },
  { key: 'Temperature', label: 'Temp', unit: '°C' },
  { key: 'Humidity', label: 'Humidity', unit: '%' },
]

const METRIC_OPTIONS = [
  { value: 'aqi', label: 'AQI', unit: '' },
  { value: 'pm25', label: 'PM 2.5', unit: 'µg/m³' },
  { value: 'pm10', label: 'PM 10', unit: 'µg/m³' },
  { value: 'co2', label: 'CO₂', unit: 'ppm' },
  { value: 'tvoc', label: 'TVOC', unit: 'µg/m³' },
  { value: 'hcho', label: 'HCHO', unit: 'µg/m³' },
  { value: 'temp', label: 'Temperature', unit: '°C' },
  { value: 'humidity', label: 'Humidity', unit: '%' },
]

const FIELD_LABELS = {
  Aqi: 'AQI', PM25: 'PM 2.5', PM10: 'PM 10', CO2: 'CO₂',
  TVOC: 'TVOC', Formaldehyde: 'HCHO',
}

// Map a trend metric to its pollutant field (for threshold lines).
const METRIC_TO_FIELD = {
  aqi: 'Aqi', pm25: 'PM25', pm10: 'PM10', co2: 'CO2', tvoc: 'TVOC', hcho: 'Formaldehyde',
}

// Format an hour (0-23) to a 12-hour label like "6 AM" / "12 PM".
const hourLabel = (h) => {
  const period = h < 12 ? 'AM' : 'PM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr} ${period}`
}

// Translate a coefficient of variation (std/avg) into plain language.
const variabilityWord = (avg, std) => {
  if (avg == null || std == null || avg === 0) return '—'
  const cv = std / avg
  if (cv < 0.1)  return 'Very stable'
  if (cv < 0.25) return 'Stable'
  if (cv < 0.5)  return 'Moderate'
  return 'Highly variable'
}

// One-line health note for an AQI category.
const HEALTH_NOTE = {
  'Good': 'Air quality is satisfactory.',
  'Moderate': 'Acceptable; unusually sensitive people may feel mild effects.',
  'Unhealthy (SG)': 'Sensitive groups should limit prolonged exertion.',
  'Unhealthy': 'Everyone may begin to feel effects.',
  'Very Unhealthy': 'Health alert — avoid prolonged exposure.',
  'Hazardous': 'Emergency conditions — stay indoors.',
}

const buildMuiTheme = (isDark) => createTheme({
  palette: {
    mode: isDark ? 'dark' : 'light',
    primary:   { main: '#1e88ff' },
    secondary: { main: '#18a957' },
    background: {
      default: isDark ? '#0c1117' : '#f6f8fb',
      paper:   isDark ? '#161c24' : '#ffffff',
    },
  },
  typography: { fontFamily: '"Inter", system-ui, -apple-system, sans-serif' },
  shape: { borderRadius: 10 },
})

const Analytics = () => {
  const { user } = useAuthContext()
  const { isDark } = useAppTheme()
  const muiTheme = useMemo(() => buildMuiTheme(isDark), [isDark])
  const isAdmin = user && user.role === 'admin'

  const [from, setFrom] = useState(dayjs().subtract(24, 'hour'))
  const [to, setTo] = useState(dayjs())
  const [deviceId, setDeviceId] = useState('all')
  const [metric, setMetric] = useState('aqi')
  const [granularity, setGranularity] = useState('auto')

  const [devices, setDevices] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [liveMode, setLiveMode] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  const reportRef = useRef(null)

  // ECharts shared theme colors
  const ec = useMemo(() => ({
    axis: isDark ? '#3a4654' : '#cbd5e1',
    label: isDark ? '#94a3b8' : '#64748b',
    split: isDark ? '#2a3441' : '#eef2f6',
    text: isDark ? '#f1f5f9' : '#0f172a',
    tooltipBg: isDark ? '#1a212b' : '#ffffff',
    tooltipBorder: isDark ? '#2a3441' : '#e2e8f0',
  }), [isDark])

  // Lookup of pollutant limits from the exceedance data (field -> limit).
  const limits = useMemo(() => {
    const map = {}
    ;(data?.exceedances || []).forEach(e => { map[e.field] = e.limit })
    return map
  }, [data])

  // ---- Derived KPI values for the headline tiles ----
  const kpiExtras = useMemo(() => {
    if (!data) return { excHours: 0, trendDelta: null }
    const aqiExc = (data.exceedances || []).find(e => e.field === 'Aqi')
    const excHours = aqiExc?.hours ?? 0
    const cur = data.comparison?.current?.avgAqi ?? 0
    const prev = data.comparison?.previous?.avgAqi ?? 0
    const trendDelta = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null
    return { excHours, trendDelta }
  }, [data])

  // ---- Plain-language insights (feature #1) ----
  const insights = useMemo(() => {
    if (!data) return []
    const out = []

    // 1. Overall good %
    if (data.kpis.count > 0) {
      const pct = data.kpis.pctGood
      out.push({
        tone: pct >= 70 ? 'good' : pct >= 40 ? 'warning' : 'bad',
        text: `Air quality was Good ${pct}% of the time during this period.`,
      })
    }

    // 2. Worst exceedance
    const worstExc = (data.exceedances || [])
      .filter(e => e.field !== 'Aqi' && e.hours > 0)
      .sort((a, b) => b.pctTime - a.pctTime)[0]
    if (worstExc) {
      out.push({
        tone: 'bad',
        text: `${FIELD_LABELS[worstExc.field] || worstExc.field} exceeded its safe limit (${worstExc.limit}) for ${worstExc.hours} hour${worstExc.hours === 1 ? '' : 's'} — ${worstExc.pctTime}% of the time.`,
      })
    } else if (data.kpis.count > 0) {
      out.push({ tone: 'good', text: 'No pollutant exceeded its safety limit in this period.' })
    }

    // 3. Comparison to previous period
    if (data.comparison && data.comparison.previous.avgAqi > 0) {
      const cur = data.comparison.current.avgAqi
      const prev = data.comparison.previous.avgAqi
      const delta = Math.round(((cur - prev) / prev) * 100)
      if (delta !== 0) {
        out.push({
          tone: delta < 0 ? 'good' : 'warning',
          text: `Average AQI is ${Math.abs(delta)}% ${delta < 0 ? 'lower (better)' : 'higher (worse)'} than the previous period.`,
        })
      }
    }

    // 4. Worst time (from trend buckets — the bucket with the highest avg AQI)
    if (data.buckets.length > 0) {
      const worst = data.buckets.reduce((a, b) => (b.aqi > a.aqi ? b : a))
      out.push({
        tone: 'neutral',
        text: `Air was worst around ${dayjs(worst.time).format('ddd, MMM D · h A')} (AQI ${worst.aqi}).`,
      })
    }

    // 5. Stability of AQI
    const aqiStat = data.pollutantStats?.Aqi
    if (aqiStat && aqiStat.avg != null) {
      out.push({
        tone: 'neutral',
        text: `AQI readings were ${variabilityWord(aqiStat.avg, aqiStat.std).toLowerCase()} (low fluctuation is better).`,
      })
    }

    return out
  }, [data])

  // Fetch devices for the filter dropdown
  useEffect(() => {
    if (!isAdmin) return
    const fetchDevices = async () => {
      const res = await fetch('/api/device', { headers: { Authorization: `Bearer ${user.token}` } })
      if (res.ok) setDevices(await res.json())
    }
    fetchDevices()
  }, [user, isAdmin])

  // Fetch analytics on filter change + poll every 30s while live.
  useEffect(() => {
    if (!isAdmin) return

    const fetchAnalytics = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      setError('')
      const effectiveTo = liveMode ? dayjs() : to

      const params = new URLSearchParams({
        from: from.toISOString(),
        to: effectiveTo.toISOString(),
      })
      if (deviceId !== 'all') params.append('deviceId', deviceId)
      if (granularity !== 'auto') params.append('granularity', granularity)

      try {
        const res = await fetch(`/api/aqi/analytics?${params}`, {
          headers: { Authorization: `Bearer ${user.token}` }
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load analytics')
        setData(json)
        setLastUpdated(new Date())
      } catch (err) {
        setError(err.message)
      } finally {
        if (isInitial) setLoading(false)
      }
    }

    fetchAnalytics(true)
    if (!liveMode) return
    const interval = setInterval(() => fetchAnalytics(false), 30000)
    return () => clearInterval(interval)
  }, [user, isAdmin, from, to, deviceId, granularity, liveMode])

  // ---- Chart option builders ----
  const trendOption = useMemo(() => {
    if (!data) return null
    const m = METRIC_OPTIONS.find(o => o.value === metric) || METRIC_OPTIONS[0]
    const isAqi = metric === 'aqi'

    // For AQI, plot the per-bucket PEAK (so brief spikes show and the chart's
    // peak matches the "Highest AQI" tile). Other metrics plot the bucket average.
    const points = data.buckets.map(b => [
      new Date(b.time).getTime(),
      isAqi ? (b.aqiMax ?? b.aqi) : b[metric],
    ])

    // Safety limit line for this metric (if one exists)
    const limitField = METRIC_TO_FIELD[metric]
    const limitVal = limitField ? limits[limitField] : null

    const vals = points.map(p => p[1]).filter(v => v != null)
    // Average reference line: use the TRUE period average from the backend for AQI
    // (not the average of the plotted peaks), otherwise the mean of plotted points.
    const avgVal = isAqi
      ? (data.pollutantStats?.Aqi?.avg != null ? Math.round(data.pollutantStats.Aqi.avg) : null)
      : (vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null)

    // #1 AQI category background bands (only for the AQI metric).
    // Each band is a horizontal zone tinted with the category colour.
    const maxVal = vals.length ? Math.max(...vals) : 0
    const AQI_BANDS = [
      { from: 0,   to: 50,  color: 'rgba(22,163,74,0.10)' },   // Good
      { from: 50,  to: 100, color: 'rgba(245,158,11,0.10)' },  // Moderate
      { from: 100, to: 150, color: 'rgba(234,88,12,0.10)' },   // Unhealthy (SG)
      { from: 150, to: 200, color: 'rgba(220,38,38,0.10)' },   // Unhealthy
      { from: 200, to: 300, color: 'rgba(147,51,234,0.10)' },  // Very Unhealthy
      { from: 300, to: 500, color: 'rgba(127,29,29,0.12)' },   // Hazardous
    ]
    const bandAreas = isAqi
      ? AQI_BANDS
          .filter(b => b.from <= maxVal + 20) // only render bands the data reaches
          .map(b => [{ yAxis: b.from, itemStyle: { color: b.color } }, { yAxis: b.to }])
      : []

    // #3 Period-average reference line + #2 threshold line, combined into markLine.
    const markLineData = []
    if (avgVal != null) {
      markLineData.push({
        yAxis: avgVal,
        lineStyle: { type: 'solid', color: ec.label, width: 1, opacity: 0.6 },
        label: {
          formatter: `Avg ${avgVal}`, color: ec.label, position: 'insideStartTop',
          fontSize: 11, fontWeight: 600,
        },
      })
    }
    if (limitVal) {
      markLineData.push({
        yAxis: limitVal,
        lineStyle: { type: 'dashed', color: '#dc2626', width: 1.5 },
        label: {
          formatter: `Limit ${limitVal}`, color: '#dc2626', position: 'insideEndTop',
          fontSize: 11, fontWeight: 600,
        },
      })
    }

    return {
      grid: { left: 52, right: 24, top: 24, bottom: 64 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: ec.tooltipBg,
        borderColor: ec.tooltipBorder,
        textStyle: { color: ec.text },
        // Snap a crosshair to the nearest reading as you move across the chart.
        axisPointer: {
          type: 'line',
          snap: true,
          lineStyle: { color: '#1e88ff', width: 1, type: 'dashed' },
          label: {
            show: true,
            backgroundColor: '#1e88ff',
            formatter: (p) => dayjs(p.value).format('MMM D, h:mm A'),
          },
        },
        formatter: (params) => {
          const p = params[0]
          const t = dayjs(p.value[0]).format('MMM D, h:mm A')
          return `${t}<br/><b>${p.value[1]}</b>${m.unit ? ' ' + m.unit : ''}`
        },
      },
      // Zoom: scroll/pinch to zoom in-chart, plus a draggable slider at the bottom.
      dataZoom: [
        { type: 'inside', throttle: 50 },
        {
          type: 'slider',
          height: 18,
          bottom: 8,
          borderColor: ec.split,
          fillerColor: 'rgba(30,136,255,0.12)',
          handleStyle: { color: '#1e88ff' },
          dataBackground: { lineStyle: { color: ec.axis }, areaStyle: { color: ec.split } },
          textStyle: { color: ec.label },
          labelFormatter: (val) => dayjs(val).format('MMM D, h A'),
        },
      ],
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: ec.axis } },
        axisLabel: {
          color: ec.label,
          formatter: (val) => dayjs(val).format('h A'),
          hideOverlap: true,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        // For AQI, always show at least up to 150 (Good→SG zones) so the
        // colour bands are visible, expanding if readings go higher.
        max: isAqi ? Math.max(150, Math.ceil((maxVal + 20) / 50) * 50) : undefined,
        axisLabel: { color: ec.label },
        splitLine: { lineStyle: { color: ec.split } },
      },
      series: [{
        name: m.label,
        type: 'line',
        smooth: true,
        showSymbol: false,
        // Show a highlighted dot at the hovered point.
        symbol: 'circle',
        symbolSize: 8,
        emphasis: {
          focus: 'series',
          itemStyle: {
            color: '#1e88ff',
            borderColor: '#fff',
            borderWidth: 2,
          },
        },
        data: points,
        lineStyle: { width: 2.5, color: '#1e88ff' },
        itemStyle: { color: '#1e88ff' },
        // Keep the gradient fill only when NOT showing category bands,
        // so the bands stay readable behind the line.
        areaStyle: isAqi ? undefined : {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(30,136,255,0.35)' },
              { offset: 1, color: 'rgba(30,136,255,0.02)' },
            ],
          },
        },
        // #1 Category bands + #3 average line + threshold line.
        markArea: bandAreas.length ? { silent: true, data: bandAreas } : undefined,
        markLine: markLineData.length ? {
          silent: true,
          symbol: 'none',
          data: markLineData,
        } : undefined,
        // #2 Peak & low markers
        markPoint: {
          symbolSize: 46,
          data: [
            {
              type: 'max',
              name: 'Peak',
              itemStyle: { color: '#dc2626' },
              label: {
                formatter: (p) => `Peak\n${Array.isArray(p.value) ? p.value[1] : p.value}`,
                color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 12,
              },
            },
            {
              type: 'min',
              name: 'Low',
              itemStyle: { color: '#16a34a' },
              label: {
                formatter: (p) => `Low\n${Array.isArray(p.value) ? p.value[1] : p.value}`,
                color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 12,
              },
            },
          ],
        },
      }],
    }
  }, [data, metric, ec, limits])

  const donutOption = useMemo(() => {
    if (!data) return null
    const slices = data.categories.filter(c => c.count > 0).map(c => ({
      value: c.count, name: c.label,
      itemStyle: { color: CATEGORY_COLORS[c.label] || '#94a3b8' },
    }))
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: ec.tooltipBg,
        borderColor: ec.tooltipBorder,
        textStyle: { color: ec.text },
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        bottom: 0, left: 'center', textStyle: { color: ec.label },
        itemWidth: 12, itemHeight: 12,
      },
      series: [{
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: ec.tooltipBg, borderWidth: 2, borderRadius: 4 },
        label: { show: true, formatter: '{d}%', color: ec.text, fontWeight: 600 },
        data: slices,
      }],
    }
  }, [data, ec])

  const heatmapOption = useMemo(() => {
    if (!data) return null
    const grid = data.heatmap.map(h => [h.hour, h.dow - 1, h.avgAqi])
    const maxAqi = Math.max(...data.heatmap.map(h => h.avgAqi), 60)
    return {
      tooltip: {
        backgroundColor: ec.tooltipBg, borderColor: ec.tooltipBorder,
        textStyle: { color: ec.text },
        formatter: (p) => `${DOW_LABELS[p.value[1]]} ${hourLabel(p.value[0])}<br/>Avg AQI: <b>${p.value[2]}</b>`,
      },
      grid: { left: 50, right: 16, top: 10, bottom: 60 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => i),
        splitArea: { show: true },
        axisLabel: {
          color: ec.label,
          interval: 2,
          formatter: (h) => hourLabel(Number(h)),
        },
        axisLine: { lineStyle: { color: ec.axis } },
      },
      yAxis: {
        type: 'category', data: DOW_LABELS,
        splitArea: { show: true },
        axisLabel: { color: ec.label },
        axisLine: { lineStyle: { color: ec.axis } },
      },
      visualMap: {
        min: 0, max: maxAqi, calculable: true,
        orient: 'horizontal', left: 'center', bottom: 6,
        textStyle: { color: ec.label },
        inRange: { color: ['#86efac', '#fcd34d', '#fb923c', '#f87171', '#a78bfa', '#7f1d1d'] },
      },
      series: [{
        name: 'AQI', type: 'heatmap', data: grid,
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.4)' } },
        itemStyle: { borderRadius: 2, borderColor: ec.tooltipBg, borderWidth: 1 },
      }],
    }
  }, [data, ec])

  const exceedanceBarOption = useMemo(() => {
    if (!data || !data.exceedances) return null
    const items = data.exceedances.filter(e => e.field !== 'Aqi')
    return {
      grid: { left: 80, right: 30, top: 10, bottom: 24 },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: ec.tooltipBg, borderColor: ec.tooltipBorder, textStyle: { color: ec.text },
        formatter: (p) => `${p[0].name}<br/>${p[0].value}% of time over limit`,
      },
      xAxis: {
        type: 'value', max: 100,
        axisLabel: { color: ec.label, formatter: '{value}%' },
        splitLine: { lineStyle: { color: ec.split } },
      },
      yAxis: {
        type: 'category',
        data: items.map(e => FIELD_LABELS[e.field] || e.field),
        axisLabel: { color: ec.label },
        axisLine: { lineStyle: { color: ec.axis } },
      },
      series: [{
        type: 'bar',
        data: items.map(e => ({
          value: e.pctTime,
          itemStyle: {
            color: e.pctTime > 50 ? '#dc2626' : e.pctTime > 20 ? '#f59e0b' : '#16a34a',
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barWidth: '55%',
      }],
    }
  }, [data, ec])

  const downloadReport = async () => {
    if (!data || !reportRef.current) return
    setPdfLoading(true)

    const effectiveTo = liveMode ? dayjs() : to
    const deviceLabel = deviceId === 'all'
      ? 'All devices'
      : (devices.find(d => d.deviceId === deviceId)?.name || deviceId)

    try {
      const el = reportRef.current

      // Force light background so charts are readable on white PDF
      const prevBg = el.style.background
      el.style.background = '#ffffff'

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollY: -window.scrollY,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      })

      el.style.background = prevBg

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 12
      const contentW = pageW - margin * 2

      // Header
      pdf.setFontSize(18)
      pdf.setFont('helvetica', 'bold')
      pdf.text('BewAir — Analytics Report', margin, margin + 6)

      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(100)
      pdf.text(`Generated: ${dayjs().format('MMM D YYYY, h:mm A')}`, margin, margin + 12)
      pdf.text(`Period: ${from.format('MMM D YYYY h:mm A')} — ${effectiveTo.format('MMM D YYYY h:mm A')}`, margin, margin + 17)
      pdf.text(`Device: ${deviceLabel}`, margin, margin + 22)
      pdf.setTextColor(0)

      // Charts image — fit width, split across pages
      const headerH = 30
      const imgW = contentW
      const imgH = (canvas.height / canvas.width) * imgW

      const availableH = pageH - margin - headerH
      let yOffset = 0

      while (yOffset < imgH) {
        const sliceH = Math.min(availableH, imgH - yOffset)
        const srcY = (yOffset / imgH) * canvas.height
        const srcH = (sliceH / imgH) * canvas.height

        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = srcH
        const ctx = sliceCanvas.getContext('2d')
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)

        const sliceData = sliceCanvas.toDataURL('image/png')
        const yPos = yOffset === 0 ? margin + headerH : margin

        pdf.addImage(sliceData, 'PNG', margin, yPos, imgW, sliceH)
        yOffset += sliceH

        if (yOffset < imgH) pdf.addPage()
      }

      pdf.save(`bewair-analytics-${dayjs().format('YYYY-MM-DD-HHmm')}.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  // ---- Admin gate ----
  if (!user) {
    return <ThemeProvider theme={muiTheme}><CssBaseline /><Box sx={{ p: 3 }}><Alert severity="warning">Please log in.</Alert></Box></ThemeProvider>
  }
  if (!isAdmin) {
    return (
      <ThemeProvider theme={muiTheme}><CssBaseline />
        <Box sx={{ p: 3 }}>
          <Alert severity="error">Analytics is admin-only.</Alert>
        </Box>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Box sx={{ p: 0 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Analytics</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Download size={16} />}
                onClick={downloadReport}
                disabled={!data || pdfLoading}
                sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
              >
                {pdfLoading ? 'Generating PDF…' : 'Download PDF'}
              </Button>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 0.5, borderRadius: '999px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: liveMode ? '#22c55e' : '#94a3b8', boxShadow: liveMode ? '0 0 0 4px rgba(34,197,94,0.18)' : 'none' }} />
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {liveMode ? 'Live' : 'Paused'}{lastUpdated && ` · ${dayjs(lastUpdated).format('HH:mm:ss')}`}
              </Typography>
              <FormControlLabel sx={{ ml: 0.5, mr: -0.5 }} control={
                <Switch size="small" checked={liveMode} onChange={(e) => { setLiveMode(e.target.checked); if (e.target.checked) setTo(dayjs()) }} />
              } label="" />
            </Box>
            </Box>
          </Box>

          {/* Filter bar */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={3}>
                  <DateTimePicker label="From" value={from} onChange={(v) => { setFrom(v); setLiveMode(false) }} slotProps={{ textField: { fullWidth: true, size: 'small' } }} />
                </Grid>
                <Grid item xs={12} md={3}>
                  <DateTimePicker label="To" value={to} onChange={(v) => { setTo(v); setLiveMode(false) }} disabled={liveMode} slotProps={{ textField: { fullWidth: true, size: 'small' } }} />
                </Grid>
                <Grid item xs={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Device</InputLabel>
                    <Select label="Device" value={deviceId} onChange={e => setDeviceId(e.target.value)}>
                      <MenuItem value="all">All devices</MenuItem>
                      {devices.map(d => <MenuItem key={d.deviceId} value={d.deviceId}>{d.name} — {d.room}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Granularity</InputLabel>
                    <Select label="Granularity" value={granularity} onChange={e => setGranularity(e.target.value)}>
                      <MenuItem value="auto">Auto</MenuItem>
                      <MenuItem value="hour">Hourly</MenuItem>
                      <MenuItem value="day">Daily</MenuItem>
                      <MenuItem value="week">Weekly</MenuItem>
                      <MenuItem value="month">Monthly</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Trend metric</InputLabel>
                    <Select label="Trend metric" value={metric} onChange={e => setMetric(e.target.value)}>
                      {METRIC_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {data && !loading && (
            <div ref={reportRef}>
              {/* KPI cards — dashboard-style grid, auto-fit, larger tiles */}
              <div className="dash-kpis analytics-kpis">
                <AnalyticsKpi
                  icon={<Activity size={22} />}
                  label="Average AQI"
                  value={data.kpis.avg}
                  hint={`${data.kpis.avgCategory}`}
                  sub={HEALTH_NOTE[data.kpis.avgCategory] || ''}
                  accent={CATEGORY_COLORS[data.kpis.avgCategory]}
                />
                <AnalyticsKpi
                  icon={<TrendingUp size={22} />}
                  label="Highest AQI"
                  value={data.kpis.max}
                  hint="Worst single reading"
                  sub="The peak AQI recorded in this range"
                  accent="#dc2626"
                />
                <AnalyticsKpi
                  icon={<Clock size={22} />}
                  label="Hours Over Limit"
                  value={kpiExtras.excHours}
                  hint={kpiExtras.excHours > 0 ? 'Air was unsafe' : 'Air stayed safe'}
                  sub={
                    kpiExtras.excHours > 0
                      ? `AQI was above the safe limit for ${kpiExtras.excHours} hour${kpiExtras.excHours === 1 ? '' : 's'}`
                      : 'AQI never crossed the safe limit'
                  }
                  accent={kpiExtras.excHours > 0 ? '#dc2626' : '#16a34a'}
                />
                <AnalyticsKpi
                  icon={
                    kpiExtras.trendDelta == null ? <Minus size={22} />
                    : kpiExtras.trendDelta < 0 ? <TrendingDown size={22} />
                    : kpiExtras.trendDelta > 0 ? <TrendingUp size={22} />
                    : <Minus size={22} />
                  }
                  label="Trend"
                  value={
                    kpiExtras.trendDelta == null ? '—'
                    : `${Math.abs(kpiExtras.trendDelta)}%`
                  }
                  hint={
                    kpiExtras.trendDelta == null ? 'No prior data'
                    : kpiExtras.trendDelta < 0 ? 'Improving'
                    : kpiExtras.trendDelta > 0 ? 'Worsening'
                    : 'No change'
                  }
                  sub={
                    kpiExtras.trendDelta == null ? 'Not enough history to compare'
                    : kpiExtras.trendDelta < 0 ? 'Air is better than the previous period'
                    : kpiExtras.trendDelta > 0 ? 'Air is worse than the previous period'
                    : 'Same as the previous period'
                  }
                  accent={
                    kpiExtras.trendDelta == null ? '#94a3b8'
                    : kpiExtras.trendDelta < 0 ? '#16a34a'
                    : kpiExtras.trendDelta > 0 ? '#dc2626'
                    : '#94a3b8'
                  }
                />
              </div>

              {/* Trend (feature 2) */}
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {(METRIC_OPTIONS.find(o => o.value === metric) || {}).label} Over Time
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                    {metric === 'aqi'
                      ? 'Line shows the peak AQI per interval. Background colors are health zones (green = good → red = unhealthy); gray line = period average; peak/low points marked. Scroll or drag the slider to zoom.'
                      : 'Red dashed line = safety limit, gray line = period average, peak/low points marked. Scroll or drag the slider to zoom.'}
                  </Typography>
                  {data.buckets.length === 0
                    ? <Typography color="text.secondary">No data in this range.</Typography>
                    : <ReactECharts option={trendOption} style={{ height: 480 }} notMerge />}
                </CardContent>
              </Card>

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                {/* AQI distribution (feature 6) */}
                <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>AQI Category Distribution</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        How often the air fell into each health category.
                      </Typography>
                      {data.categories.every(c => c.count === 0)
                        ? <Typography color="text.secondary">No data in this range.</Typography>
                        : <ReactECharts option={donutOption} style={{ height: 320 }} notMerge />}
                    </CardContent>
                  </Card>
                </Box>

                {/* Comparative analysis (feature 5) */}
                <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Comparative Analysis</Typography>
                      {data.comparison ? (
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                          <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                            <CompareBlock
                              title="This period vs. previous"
                              current={data.comparison.current.avgAqi}
                              previous={data.comparison.previous.avgAqi}
                            />
                          </Box>
                          <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                            <CompareBlock
                              title="Weekday vs. weekend"
                              current={data.comparison.weekday.avgAqi}
                              previous={data.comparison.weekend.avgAqi}
                              currentLabel="Weekday"
                              previousLabel="Weekend"
                            />
                          </Box>
                        </Box>
                      ) : <Typography color="text.secondary">Not enough data.</Typography>}
                    </CardContent>
                  </Card>
                </Box>
              </Box>

              {/* Per-pollutant statistics (feature 1) */}
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Pollutant Statistics</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                    Status shows whether each pollutant's average is within its safety limit. Stability reflects how much readings fluctuated.
                  </Typography>
                  <PollutantStatsTable stats={data.pollutantStats} limits={limits} />
                </CardContent>
              </Card>

              {/* Exceedance reporting (feature 4) */}
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Threshold Exceedances</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                    Hours each pollutant's average crossed its safety limit.
                  </Typography>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={6}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {(data.exceedances || []).filter(e => e.field !== 'Aqi').map(e => (
                          <ExceedanceRow key={e.field} item={e} />
                        ))}
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      {data.exceedances && data.exceedances.length > 0
                        ? <ReactECharts option={exceedanceBarOption} style={{ height: 220 }} notMerge />
                        : <Typography color="text.secondary">No data.</Typography>}
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Pattern heatmap (feature 3) */}
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Hour × Day Pattern (last 7 days)</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                    Average AQI by hour of day and day of week — reveals recurring patterns.
                  </Typography>
                  {data.heatmap.length === 0
                    ? <Typography color="text.secondary">No data in the last 7 days.</Typography>
                    : <ReactECharts option={heatmapOption} style={{ height: 320 }} notMerge />}
                </CardContent>
              </Card>

              {/* Recent readings */}
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Recent Readings (last 100)</Typography>
                  <DataGrid
                    rows={data.recent.map(r => ({ ...r, id: r._id }))}
                    columns={[
                      { field: 'createdAt', headerName: 'Time', flex: 1.3, valueFormatter: v => v ? dayjs(v).format('MMM D, h:mm:ss A') : '' },
                      { field: 'deviceId', headerName: 'Device ID', flex: 1 },
                      { field: 'Aqi', headerName: 'AQI', flex: 0.5 },
                      { field: 'category', headerName: 'Category', flex: 1, renderCell: (p) => (
                        <Chip label={p.value} size="small" sx={{ bgcolor: CATEGORY_COLORS[p.value] || '#94a3b8', color: 'white', fontWeight: 600 }} />
                      )},
                      { field: 'PM25', headerName: 'PM2.5', flex: 0.6 },
                      { field: 'PM10', headerName: 'PM10', flex: 0.6 },
                      { field: 'CO2', headerName: 'CO₂', flex: 0.6 },
                      { field: 'Temperature', headerName: 'Temp', flex: 0.6 },
                      { field: 'Humidity', headerName: 'Humidity', flex: 0.6 },
                    ]}
                    initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                    pageSizeOptions={[10, 25, 50]}
                    disableRowSelectionOnClick autoHeight density="compact"
                  />
                </CardContent>
              </Card>

              {/* Insights panel (feature #1) — moved to bottom */}
              {insights.length > 0 && (
                <Card sx={{ mt: 2 }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Key Insights</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {insights.map((ins, i) => <InsightRow key={i} insight={ins} />)}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </Box>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

// ============== Sub-components ==============
// Dashboard-style KPI tile (uses the global .dash-kpi classes for consistency).
const AnalyticsKpi = ({ icon, label, value, hint, sub, accent }) => (
  <div className="dash-kpi analytics-kpi" style={{ borderTopColor: accent }}>
    <div className="dash-kpi-icon" style={{ color: accent }}>{icon}</div>
    <div className="dash-kpi-label">{label}</div>
    <div className="dash-kpi-value" style={{ color: accent }}>{value}</div>
    {hint && <div className="analytics-kpi-hint" style={{ color: accent }}>{hint}</div>}
    {sub && <div className="dash-kpi-sub">{sub}</div>}
  </div>
)

const InsightRow = ({ insight }) => {
  const tone = {
    good:    { bg: '#dcfce7', fg: '#166534', icon: '✓' },
    warning: { bg: '#fef3c7', fg: '#92400e', icon: '!' },
    bad:     { bg: '#fee2e2', fg: '#991b1b', icon: '▲' },
    neutral: { bg: '#e0e7ff', fg: '#3730a3', icon: 'i' },
  }[insight.tone] || { bg: '#e2e8f0', fg: '#334155', icon: '•' }
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      <Box sx={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        bgcolor: tone.bg, color: tone.fg, fontWeight: 800, fontSize: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 0.2,
      }}>{tone.icon}</Box>
      <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.5 }}>
        {insight.text}
      </Typography>
    </Box>
  )
}

// Map a variability word to a pill style.
const STABILITY_CLASS = {
  'Very stable': 'stats-pill-stable',
  'Stable': 'stats-pill-stable',
  'Moderate': 'stats-pill-moderate',
  'Highly variable': 'stats-pill-variable',
}

const PollutantStatsTable = ({ stats, limits }) => (
  <Box sx={{ overflowX: 'auto' }}>
    <table className="stats-table">
      <thead>
        <tr>
          <th>Pollutant</th><th>Status</th><th>Average</th><th>Min</th><th>Max</th><th>Stability</th>
        </tr>
      </thead>
      <tbody>
        {POLLUTANTS.map(p => {
          const s = stats?.[p.key]
          if (!s) return null
          const u = p.unit ? ` ${p.unit}` : ''
          const limit = limits?.[p.key]

          // Status pill
          let statusClass = 'stats-pill-na'
          let statusText = 'No limit'
          let dotColor = '#94a3b8'
          if (limit != null && s.avg != null) {
            const over = s.avg > limit
            statusClass = over ? 'stats-pill-over' : 'stats-pill-ok'
            statusText = over ? 'Over limit' : 'Within limit'
            dotColor = over ? '#dc2626' : '#16a34a'
          }

          // Stability pill
          const stab = variabilityWord(s.avg, s.std)
          const stabClass = STABILITY_CLASS[stab] || 'stats-pill-na'

          return (
            <tr key={p.key}>
              <td className="stats-name">{p.label}</td>
              <td>
                <span className={`stats-pill ${statusClass}`}>
                  <span className="stats-pill-dot" style={{ background: dotColor }} />
                  {statusText}
                </span>
              </td>
              <td><strong style={{ color: 'var(--color-text-primary)' }}>{s.avg ?? '—'}</strong>{s.avg != null ? u : ''}</td>
              <td>{s.min ?? '—'}{s.min != null ? u : ''}</td>
              <td>{s.max ?? '—'}{s.max != null ? u : ''}</td>
              <td><span className={`stats-pill ${stabClass}`}>{stab}</span></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </Box>
)

const CompareBlock = ({ title, current, previous, currentLabel = 'Current', previousLabel = 'Previous' }) => {
  const cur = current ?? 0
  const prev = previous ?? 0
  const delta = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0
  const worse = cur > prev
  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{title.toUpperCase()}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: 1 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>{cur}</Typography>
          <Typography variant="caption" color="text.secondary">{currentLabel}</Typography>
        </Box>
        <Typography variant="h6" color="text.secondary">vs</Typography>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.secondary' }}>{prev}</Typography>
          <Typography variant="caption" color="text.secondary">{previousLabel}</Typography>
        </Box>
      </Box>
      {prev > 0 && (
        <Chip
          size="small"
          label={`${worse ? '▲' : '▼'} ${Math.abs(delta)}% ${worse ? 'higher' : 'lower'}`}
          sx={{ mt: 1.5, bgcolor: worse ? '#fee2e2' : '#dcfce7', color: worse ? '#991b1b' : '#166534', fontWeight: 600 }}
        />
      )}
    </Box>
  )
}

const ExceedanceRow = ({ item }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.2, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{FIELD_LABELS[item.field] || item.field}</Typography>
      <Typography variant="caption" color="text.secondary">limit {item.limit}</Typography>
    </Box>
    <Box sx={{ textAlign: 'right' }}>
      <Typography variant="body2" sx={{ fontWeight: 700, color: item.hours > 0 ? '#dc2626' : '#16a34a' }}>
        {item.hours} / {item.totalHours} hrs
      </Typography>
      <Typography variant="caption" color="text.secondary">{item.pctTime}% of the time</Typography>
    </Box>
  </Box>
)

export default Analytics
