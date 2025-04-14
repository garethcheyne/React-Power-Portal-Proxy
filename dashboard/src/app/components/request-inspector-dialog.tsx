/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyIcon, CheckIcon, Maximize2Icon, Minimize2Icon } from "lucide-react";

// Define types for the request and response data
type RequestInspectorProps = {
    isOpen: boolean;
    onClose: () => void;
    requestData: RequestLogEntry | null;
};

// Full type definitions for requests and responses
export type RequestLogEntry = {
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
};

export function RequestInspectorDialog({ isOpen, onClose, requestData }: RequestInspectorProps) {
    const [activeTab, setActiveTab] = useState('request');
    const [copied, setCopied] = useState('');
    const [isFullScreen, setIsFullScreen] = useState(false);

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
            day: 'numeric',
            year: 'numeric',
            // Add milliseconds for precise timing
            fractionalSecondDigits: 3
        }).format(date);
    };

    // Toggle full screen mode
    const toggleFullScreen = () => {
        setIsFullScreen(!isFullScreen);
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

    // Function to pretty print JSON
    const prettyPrintJSON = (data: any) => {
        try {
            if (typeof data === 'string') {
                // Try to parse JSON strings
                const parsed = JSON.parse(data);
                return JSON.stringify(parsed, null, 2);
            }
            return JSON.stringify(data, null, 2);
        } catch (e) {
            // If it's not valid JSON, return as is
            return data;
        }
    };

    // Copy to clipboard function
    const copyToClipboard = (text: string, type: string) => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(''), 2000);
    };

    // Determine content type and format accordingly
    const formatContent = (content: any, contentType: string) => {
        if (!content) return "No content";

        if (typeof content === 'string') {
            if (contentType?.includes('application/json') ||
                (content.startsWith('{') && content.endsWith('}')) ||
                (content.startsWith('[') && content.endsWith(']'))) {
                try {
                    const parsed = JSON.parse(content);
                    return (
                        <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm">
                            <code>{JSON.stringify(parsed, null, 2)}</code>
                        </pre>
                    );
                } catch (e) {
                    // Fall back to plain text if not valid JSON
                }
            } else if (contentType?.includes('text/html')) {
                return (
                    <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm">
                        <div dangerouslySetInnerHTML={{ __html: content }} />
                    </div>
                );
            } else if (contentType?.includes('text/plain') || contentType?.includes('text/')) {
                return (
                    <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm">
                        <code>{content}</code>
                    </pre>
                );
            }
        }

        // For objects or anything else
        return (
            <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm">
                <code>{prettyPrintJSON(content)}</code>
            </pre>
        );
    };

    if (!requestData) return null;

    // Use a completely different approach for full-screen mode
    if (isFullScreen) {
        return (
            <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h2 className="text-lg font-semibold flex items-center gap-3">
                            <Badge className={getMethodBadgeColor(requestData.request.method)}>
                                {requestData.request.method}
                            </Badge>
                            <span className="font-mono truncate">{requestData.request.path}</span>
                            <Badge className={getStatusBadgeColor(requestData.response.statusCode)}>
                                {requestData.response.statusCode}
                            </Badge>
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {formatDate(requestData.timestamp)} · {requestData.duration}ms
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleFullScreen}
                        className="ml-auto"
                        title="Exit full screen"
                    >
                        <Minimize2Icon className="h-5 w-5" />
                    </Button>
                </div>

                <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="flex-1 flex flex-col overflow-hidden"
                >
                    <div className="border-b bg-background">
                        <TabsList className="w-full max-w-screen-lg mx-auto">
                            <TabsTrigger value="request">Request</TabsTrigger>
                            <TabsTrigger value="response">Response</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="request" className="flex-1 overflow-auto p-6">
                        <div className="space-y-4 max-w-screen-lg mx-auto">
                            <Card>
                                <CardHeader className="py-3">
                                    <CardTitle className="text-sm flex items-center justify-between">
                                        <span>Request URL</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8"
                                            onClick={() => copyToClipboard(requestData.request.url, 'url')}
                                        >
                                            {copied === 'url' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                        </Button>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <pre className="font-mono text-sm bg-neutral-100 dark:bg-neutral-800 p-3 rounded-md overflow-x-auto">
                                        {requestData.request.url}
                                    </pre>
                                </CardContent>
                            </Card>

                            {requestData.request.headers && Object.keys(requestData.request.headers).length > 0 && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Request Headers</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    JSON.stringify(requestData.request.headers, null, 2),
                                                    'reqHeaders'
                                                )}
                                            >
                                                {copied === 'reqHeaders' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="max-h-[300px] overflow-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-left">
                                                <tr>
                                                    <th className="px-2 py-1 border-b w-1/3">Header</th>
                                                    <th className="px-2 py-1 border-b">Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(requestData.request.headers).map(([key, value]) => (
                                                    <tr key={key} className="hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                                        <td className="px-2 py-1 border-b font-medium">{key}</td>
                                                        <td className="px-2 py-1 border-b font-mono break-all">{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </CardContent>
                                </Card>
                            )}

                            {requestData.request.query && Object.keys(requestData.request.query).length > 0 && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Query Parameters</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    JSON.stringify(requestData.request.query, null, 2),
                                                    'reqQuery'
                                                )}
                                            >
                                                {copied === 'reqQuery' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <table className="w-full text-sm">
                                            <thead className="text-left">
                                                <tr>
                                                    <th className="px-2 py-1 border-b w-1/3">Parameter</th>
                                                    <th className="px-2 py-1 border-b">Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(requestData.request.query).map(([key, value]) => (
                                                    <tr key={key} className="hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                                        <td className="px-2 py-1 border-b font-medium">{key}</td>
                                                        <td className="px-2 py-1 border-b font-mono break-all">{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </CardContent>
                                </Card>
                            )}

                            {requestData.request.body && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Request Body</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    typeof requestData.request.body === 'string'
                                                        ? requestData.request.body
                                                        : JSON.stringify(requestData.request.body, null, 2),
                                                    'reqBody'
                                                )}
                                            >
                                                {copied === 'reqBody' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {formatContent(requestData.request.body, requestData.request.headers?.['content-type'])}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="response" className="flex-1 overflow-auto p-6">
                        <div className="space-y-4 max-w-screen-lg mx-auto">
                            <Card>
                                <CardHeader className="py-3">
                                    <CardTitle className="text-sm">Response Status</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-3">
                                        <Badge className={getStatusBadgeColor(requestData.response.statusCode)}>
                                            {requestData.response.statusCode}
                                        </Badge>
                                        <span className="font-medium">{requestData.response.statusMessage}</span>
                                        <span className="text-neutral-500">({requestData.duration}ms)</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {requestData.response.headers && Object.keys(requestData.response.headers).length > 0 && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Response Headers</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    JSON.stringify(requestData.response.headers, null, 2),
                                                    'resHeaders'
                                                )}
                                            >
                                                {copied === 'resHeaders' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="max-h-[300px] overflow-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-left">
                                                <tr>
                                                    <th className="px-2 py-1 border-b w-1/3">Header</th>
                                                    <th className="px-2 py-1 border-b">Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(requestData.response.headers).map(([key, value]) => (
                                                    <tr key={key} className="hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                                        <td className="px-2 py-1 border-b font-medium">{key}</td>
                                                        <td className="px-2 py-1 border-b font-mono break-all">{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </CardContent>
                                </Card>
                            )}

                            {requestData.response.body && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Response Body</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    typeof requestData.response.body === 'string'
                                                        ? requestData.response.body
                                                        : JSON.stringify(requestData.response.body, null, 2),
                                                    'resBody'
                                                )}
                                            >
                                                {copied === 'resBody' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {formatContent(requestData.response.body, requestData.response.contentType)}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        );
    }

    // Regular dialog mode (not full-screen)
    return (
        <Dialog open={isOpen} onOpenChange={() => onClose()}>
            <DialogContent
                className="max-w-screen-lg max-h-[80vh] overflow-hidden flex flex-col"
            >
                <DialogHeader className="flex flex-row items-center justify-between">
                    <div>
                        <DialogTitle className="flex items-center gap-3">
                            <Badge className={getMethodBadgeColor(requestData.request.method)}>
                                {requestData.request.method}
                            </Badge>
                            <span className="font-mono truncate">{requestData.request.path}</span>
                            <Badge className={getStatusBadgeColor(requestData.response.statusCode)}>
                                {requestData.response.statusCode}
                            </Badge>
                        </DialogTitle>
                        <DialogDescription>
                            {formatDate(requestData.timestamp)} · {requestData.duration}ms
                        </DialogDescription>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleFullScreen}
                        className="ml-auto mr-2"
                        title="Enter full screen"
                    >
                        <Maximize2Icon className="h-5 w-5" />
                    </Button>
                </DialogHeader>

                <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="flex-1 flex flex-col overflow-hidden"
                >
                    <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="request">Request</TabsTrigger>
                        <TabsTrigger value="response">Response</TabsTrigger>
                    </TabsList>

                    <TabsContent value="request" className="flex-1 overflow-auto p-1">
                        <div className="space-y-4">
                            <Card>
                                <CardHeader className="py-3">
                                    <CardTitle className="text-sm flex items-center justify-between">
                                        <span>Request URL</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8"
                                            onClick={() => copyToClipboard(requestData.request.url, 'url')}
                                        >
                                            {copied === 'url' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                        </Button>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <pre className="font-mono text-sm bg-neutral-100 dark:bg-neutral-800 p-3 rounded-md overflow-x-auto">
                                        {requestData.request.url}
                                    </pre>
                                </CardContent>
                            </Card>

                            {requestData.request.headers && Object.keys(requestData.request.headers).length > 0 && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Request Headers</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    JSON.stringify(requestData.request.headers, null, 2),
                                                    'reqHeaders'
                                                )}
                                            >
                                                {copied === 'reqHeaders' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="max-h-[300px] overflow-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-left">
                                                <tr>
                                                    <th className="px-2 py-1 border-b w-1/3">Header</th>
                                                    <th className="px-2 py-1 border-b">Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(requestData.request.headers).map(([key, value]) => (
                                                    <tr key={key} className="hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                                        <td className="px-2 py-1 border-b font-medium">{key}</td>
                                                        <td className="px-2 py-1 border-b font-mono break-all">{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </CardContent>
                                </Card>
                            )}

                            {requestData.request.query && Object.keys(requestData.request.query).length > 0 && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Query Parameters</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    JSON.stringify(requestData.request.query, null, 2),
                                                    'reqQuery'
                                                )}
                                            >
                                                {copied === 'reqQuery' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <table className="w-full text-sm">
                                            <thead className="text-left">
                                                <tr>
                                                    <th className="px-2 py-1 border-b w-1/3">Parameter</th>
                                                    <th className="px-2 py-1 border-b">Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(requestData.request.query).map(([key, value]) => (
                                                    <tr key={key} className="hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                                        <td className="px-2 py-1 border-b font-medium">{key}</td>
                                                        <td className="px-2 py-1 border-b font-mono break-all">{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </CardContent>
                                </Card>
                            )}

                            {requestData.request.body && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Request Body</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    typeof requestData.request.body === 'string'
                                                        ? requestData.request.body
                                                        : JSON.stringify(requestData.request.body, null, 2),
                                                    'reqBody'
                                                )}
                                            >
                                                {copied === 'reqBody' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {formatContent(requestData.request.body, requestData.request.headers?.['content-type'])}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="response" className="flex-1 overflow-auto p-1">
                        <div className="space-y-4">
                            <Card>
                                <CardHeader className="py-3">
                                    <CardTitle className="text-sm">Response Status</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-3">
                                        <Badge className={getStatusBadgeColor(requestData.response.statusCode)}>
                                            {requestData.response.statusCode}
                                        </Badge>
                                        <span className="font-medium">{requestData.response.statusMessage}</span>
                                        <span className="text-neutral-500">({requestData.duration}ms)</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {requestData.response.headers && Object.keys(requestData.response.headers).length > 0 && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Response Headers</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    JSON.stringify(requestData.response.headers, null, 2),
                                                    'resHeaders'
                                                )}
                                            >
                                                {copied === 'resHeaders' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="max-h-[300px] overflow-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-left">
                                                <tr>
                                                    <th className="px-2 py-1 border-b w-1/3">Header</th>
                                                    <th className="px-2 py-1 border-b">Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(requestData.response.headers).map(([key, value]) => (
                                                    <tr key={key} className="hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                                        <td className="px-2 py-1 border-b font-medium">{key}</td>
                                                        <td className="px-2 py-1 border-b font-mono break-all">{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </CardContent>
                                </Card>
                            )}

                            {requestData.response.body && (
                                <Card>
                                    <CardHeader className="py-3">
                                        <CardTitle className="text-sm flex items-center justify-between">
                                            <span>Response Body</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(
                                                    typeof requestData.response.body === 'string'
                                                        ? requestData.response.body
                                                        : JSON.stringify(requestData.response.body, null, 2),
                                                    'resBody'
                                                )}
                                            >
                                                {copied === 'resBody' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {formatContent(requestData.response.body, requestData.response.contentType)}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}