'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import Image from "next/image";
import { RequestInspectorDialog, RequestLogEntry } from './request-inspector-dialog';

type LogEntry = {
  id: string;
  timestamp: string;
  request: {
    method: string;
    url: string;
    path: string;
    headers: Record<string, string>;
    body: any;
    query: Record<string, string>;
  };
  response: {
    statusCode: number;
    statusMessage: string;
    contentType: string;
    headers: Record<string, string>;
    body: any;
    duration: number;
  };
  duration: number;
  success: boolean;
};

type SummaryData = {
  totalRequests: number;
  responseTimeAvg: number;
  errors: number;
  endpoints: Record<string, {
    count: number;
    avgResponseTime: number;
    errors: number;
    lastCall: string;
    statusCodes: Record<string, number>;
  }>;
  statusCodes: Record<string, number>;
  lastRequest: string | null;
};

export default function DashboardClient() {
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshInterval] = useState(10000); // 10 seconds

  // Request inspector state
  const [selectedRequest, setSelectedRequest] = useState<RequestLogEntry | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('24h');

  // Add state variable for portal URL
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  // Fetch portal URL from our API endpoint
  useEffect(() => {
    async function fetchPortalUrl() {
      try {
        const response = await fetch('/api/portal-url');
        const data = await response.json();
        if (data.url) {
          setPortalUrl(data.url);
        }
      } catch (error) {
        console.error('Error fetching portal URL:', error);
      }
    }
    
    fetchPortalUrl();
  }, []);

  // Open the request inspector when clicking a request
  const handleRequestClick = (request: LogEntry) => {
    setSelectedRequest(request as RequestLogEntry);
    setInspectorOpen(true);
  };

  // Close the request inspector
  const handleCloseInspector = () => {
    setInspectorOpen(false);
  };

  // Fetch summary data
  const fetchSummary = async () => {
    try {
      const response = await fetch('/api/proxy-data?type=summary');
      const data = await response.json();
      setSummary(data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  // Fetch recent logs
  const fetchRecentLogs = async () => {
    try {
      const response = await fetch('/api/proxy-data?type=recent&limit=100');
      const data = await response.json();
      setRecentLogs(data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters to logs
  useEffect(() => {
    if (recentLogs.length === 0) return;

    let filtered = [...recentLogs];

    // Apply method filter
    if (methodFilter !== 'all') {
      filtered = filtered.filter(log =>
        log.request.method.toLowerCase() === methodFilter.toLowerCase()
      );
    }

    // Apply status code filter
    if (statusFilter !== 'all') {
      if (statusFilter === '2xx') {
        filtered = filtered.filter(log => log.response.statusCode >= 200 && log.response.statusCode < 300);
      } else if (statusFilter === '3xx') {
        filtered = filtered.filter(log => log.response.statusCode >= 300 && log.response.statusCode < 400);
      } else if (statusFilter === '4xx') {
        filtered = filtered.filter(log => log.response.statusCode >= 400 && log.response.statusCode < 500);
      } else if (statusFilter === '5xx') {
        filtered = filtered.filter(log => log.response.statusCode >= 500);
      } else {
        filtered = filtered.filter(log => log.response.statusCode.toString() === statusFilter);
      }
    }

    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(log =>
        log.request.path.toLowerCase().includes(query) ||
        log.request.url.toLowerCase().includes(query)
      );
    }

    // Apply time range filter
    if (timeRange !== 'all') {
      const now = new Date();
      let cutoff = new Date();

      switch (timeRange) {
        case '1h':
          cutoff = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '6h':
          cutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000);
          break;
        case '24h':
          cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
      }

      filtered = filtered.filter(log => new Date(log.timestamp) > cutoff);
    }

    setFilteredLogs(filtered);
  }, [recentLogs, searchQuery, methodFilter, statusFilter, timeRange]);

  // Initial data fetch and set up periodic refresh
  useEffect(() => {
    const fetchData = async () => {
      await Promise.all([fetchSummary(), fetchRecentLogs()]);
    };

    fetchData();

    // Set up refresh interval
    const intervalId = setInterval(() => {
      fetchData();
    }, refreshInterval);

    // Clean up on unmount
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  // Function to manually refresh data
  const handleRefresh = () => {
    setLoading(true);
    Promise.all([fetchSummary(), fetchRecentLogs()]).then(() => {
      setLoading(false);
    });
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery('');
    setMethodFilter('all');
    setStatusFilter('all');
    setTimeRange('24h');
  };

  // Calculate derived stats
  const errorRate = summary && summary.totalRequests > 0
    ? ((summary.errors / summary.totalRequests) * 100).toFixed(1)
    : '0';

  const successRate = summary && summary.totalRequests > 0
    ? (100 - parseFloat(errorRate)).toFixed(1)
    : '100';

  const avgResponseTime = summary?.responseTimeAvg
    ? Math.round(summary.responseTimeAvg)
    : 0;

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  // Get status badge color based on status code
  const getStatusBadgeColor = (status: number) => {
    if (status < 300) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (status < 400) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    if (status < 500) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
  };

  // Get method badge color
  const getMethodBadgeColor = (method: string) => {
    switch (method.toLowerCase()) {
      case 'get': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'post': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'put': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'delete': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'patch': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  // Extract unique HTTP methods for filter
  const uniqueMethods = Array.from(new Set(recentLogs.map(log => log.request.method.toUpperCase())));

  // Extract unique status codes for filter
  const uniqueStatusCodes = Array.from(new Set(recentLogs.map(log => log.response.statusCode)));

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 dark:bg-neutral-900">
      <header className="flex items-center justify-between p-6 pb-4 border-b dark:border-neutral-800">
        <div className="flex items-center gap-4">
          <Image
            src="/images/power-pages-logo.svg"
            alt="Power Pages Logo"
            width={60}
            // height={40}
            className="dark:invert-0"
          />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Power Portal Proxy Dashboard</h1>
            <p className="text-neutral-500 dark:text-neutral-400">
              Monitor your API requests and view analytics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
            className="border-primary hover:bg-primary/10"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Link
            href={portalUrl || "#"}
            target="_blank"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            Open Portal
          </Link>
        </div>
      </header>

      <Tabs
        defaultValue="overview"
        className="space-y-4 flex-1 px-6 w-full max-w-none"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="requests">Request Logs</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Total Requests"
              value={summary?.totalRequests?.toString() || "0"}
              description="Total API requests processed"
            />
            <StatsCard
              title="Average Response Time"
              value={avgResponseTime.toString()}
              description="Average time to process requests"
              unit="ms"
            />
            <StatsCard
              title="Error Rate"
              value={errorRate}
              description="Percentage of requests with errors"
              unit="%"
            />
            <StatsCard
              title="Success Rate"
              value={successRate}
              description="Percentage of successful requests"
              unit="%"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Status Code Distribution</CardTitle>
                <CardDescription>Distribution of HTTP status codes</CardDescription>
              </CardHeader>
              <CardContent className="h-80 overflow-auto">
                {summary && Object.keys(summary.statusCodes || {}).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(summary.statusCodes || {}).map(([status, count]) => (
                      <div key={status} className="flex items-center">
                        <div className="w-24">
                          <Badge className={getStatusBadgeColor(parseInt(status))}>
                            {status}
                          </Badge>
                        </div>
                        <div className="flex-1">
                          <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${parseInt(status) < 400 ? 'bg-green-500' : 'bg-red-500'}`}
                              style={{
                                width: `${(count / summary.totalRequests) * 100}%`
                              }}
                            />
                          </div>
                        </div>
                        <div className="w-16 text-right font-mono text-sm">
                          {count}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-neutral-500">
                    No status code data available yet
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Last Activity</CardTitle>
                <CardDescription>Details about recent proxy activity</CardDescription>
              </CardHeader>
              <CardContent className="h-80 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-neutral-500">Last Request</div>
                    <div className="mt-1 text-lg font-medium">
                      {summary?.lastRequest ? formatDate(summary.lastRequest) : 'Never'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-neutral-500">Active Since</div>
                    <div className="mt-1 text-lg font-medium">
                      {recentLogs.length > 0 ? formatDate(recentLogs[0]?.timestamp) : 'N/A'}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-neutral-500 mb-2">Recent Activity</div>
                  <div className="space-y-2">
                    {recentLogs.slice(0, 5).map(log => (
                      <div key={log.id} className="flex items-center gap-2 text-sm p-2 rounded bg-neutral-100 dark:bg-neutral-800">
                        <Badge className={getMethodBadgeColor(log.request.method)}>
                          {log.request.method}
                        </Badge>
                        <div className="flex-1 truncate">{log.request.path}</div>
                        <Badge className={getStatusBadgeColor(log.response.statusCode)}>
                          {log.response.statusCode}
                        </Badge>
                      </div>
                    ))}
                    {recentLogs.length === 0 && (
                      <div className="text-neutral-500 text-center py-4">
                        No activity recorded yet
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="requests">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Request Logs</CardTitle>
                <CardDescription>API requests processed by the proxy</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleRefresh} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Search paths or URLs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap md:flex-nowrap">
                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Methods</SelectItem>
                        {uniqueMethods.map(method => (
                          <SelectItem key={method} value={method.toLowerCase()}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="2xx">2xx</SelectItem>
                        <SelectItem value="3xx">3xx</SelectItem>
                        <SelectItem value="4xx">4xx</SelectItem>
                        <SelectItem value="5xx">5xx</SelectItem>
                        {uniqueStatusCodes.map(code => (
                          <SelectItem key={code} value={code.toString()}>
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={timeRange} onValueChange={setTimeRange}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Time Range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1h">Last Hour</SelectItem>
                        <SelectItem value="6h">Last 6 Hours</SelectItem>
                        <SelectItem value="24h">Last 24 Hours</SelectItem>
                        <SelectItem value="7d">Last 7 Days</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={resetFilters} className="md:ml-2">
                      Reset
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Method</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[180px]">Time</TableHead>
                      <TableHead className="text-right w-[100px]">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length > 0 ? (
                      filteredLogs.map((log) => (
                        <TableRow
                          key={log.id}
                          className="cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          onClick={() => handleRequestClick(log)}
                        >
                          <TableCell>
                            <Badge className={getMethodBadgeColor(log.request.method)}>
                              {log.request.method}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm truncate max-w-[300px]">
                            {log.request.path}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusBadgeColor(log.response.statusCode)}>
                              {log.response.statusCode}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(log.timestamp)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {log.duration}ms
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-neutral-500">
                          {loading ? 'Loading...' : (
                            searchQuery || methodFilter !== 'all' || statusFilter !== 'all' || timeRange !== '24h'
                              ? 'No matching requests found'
                              : 'No requests recorded yet'
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 text-right text-sm text-neutral-500">
                {filteredLogs.length} {filteredLogs.length === 1 ? 'request' : 'requests'} found
                {filteredLogs.length !== recentLogs.length && ` (filtered from ${recentLogs.length})`}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="endpoints">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Endpoint Performance</CardTitle>
                <CardDescription>Performance metrics for each API endpoint</CardDescription>
              </div>
              <Button variant="outline" onClick={handleRefresh} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Method</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Avg. Time</TableHead>
                      <TableHead className="text-right">Error %</TableHead>
                      <TableHead className="text-right">Last Called</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary && Object.entries(summary.endpoints || {}).length > 0 ? (
                      Object.entries(summary.endpoints || {}).map(([key, data]) => {
                        const [method, path] = key.split(':');
                        const errorRate = data.count > 0
                          ? ((data.errors / data.count) * 100).toFixed(1)
                          : '0';

                        return (
                          <TableRow key={key}>
                            <TableCell>
                              <Badge className={getMethodBadgeColor(method)}>
                                {method}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm truncate max-w-[300px]">
                              {path}
                            </TableCell>
                            <TableCell className="text-right">
                              {data.count}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {Math.round(data.avgResponseTime)}ms
                            </TableCell>
                            <TableCell className="text-right">
                              {errorRate}%
                            </TableCell>
                            <TableCell className="text-right">
                              {formatDate(data.lastCall)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-neutral-500">
                          {loading ? 'Loading...' : 'No endpoint data available yet'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Request inspector dialog */}
      <RequestInspectorDialog
        isOpen={inspectorOpen}
        onClose={handleCloseInspector}
        requestData={selectedRequest}
      />

      {/* Footer with Copilot attribution */}
      <footer className="mt-auto pt-8 pb-2 text-center border-t dark:border-neutral-800 text-sm text-neutral-500">
        <div className="flex items-center justify-center gap-2">
          <span>Made with GitHub Copilot</span>
          <span className="text-xs">(Claude 3.7)</span>
          <Image
            src="/images/copilot-logo.svg"
            alt="GitHub Copilot Logo"
            width={20}
            height={20}
            className="inline-block"
          />
        </div>
        <div className="mt-1 text-xs">
          with prompt assistance from Gareth Cheyne • <a href="https://www.err403.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">www.err403.com</a>
        </div>
      </footer>
    </main>
  );
}

function StatsCard({ title, value, description, unit = "" }: {
  title: string;
  value: string;
  description: string;
  unit?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}{unit}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}