/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogClose,
    DialogContent as BaseDialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

// Custom wide dialog content that overrides the default max width
function WideDialogContent({
    className,
    children,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
    return (
        <DialogPortal>
            <DialogOverlay />
            <DialogPrimitive.Content
                data-slot="dialog-content"
                className={cn(
                    "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[80vw] md:max-w-[85vw] lg:max-w-[90vw]",
                    className
                )}
                {...props}
            >
                {children}
                <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
                    <XIcon />
                    <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
            </DialogPrimitive.Content>
        </DialogPortal>
    );
}

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

    // Helper function to check if content is XML
    const isXMLContent = (content: string): boolean => {
        return (
            (content.trim().startsWith('<?xml') || content.trim().startsWith('<')) && 
            content.includes('</') && 
            !content.includes('<!DOCTYPE html>')
        );
    };

    // Helper to format XML with indentation
    const formatXML = (xml: string): string => {
        try {
            let formatted = '';
            let indent = '';
            const tab = '  ';
            xml.split(/>\s*</).forEach(node => {
                if (node.match(/^\/\w/)) {
                    // Closing tag
                    indent = indent.substring(tab.length);
                }
                formatted += indent + '<' + node + '>\r\n';
                if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith("?")) {
                    // Opening tag
                    indent += tab;
                }
            });
            return formatted.substring(1, formatted.length - 3);
        } catch (e) {
            return xml;
        }
    };

    // Detect content type and apply styles
    const getContentTypeStyles = (contentType: string | undefined) => {
        if (!contentType) return 'language-text';
        
        if (contentType.includes('application/json')) {
            return 'language-json';
        } else if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
            return 'language-xml';
        } else if (contentType.includes('text/html')) {
            return 'language-html';
        } else if (contentType.includes('text/css')) {
            return 'language-css';
        } else if (contentType.includes('javascript')) {
            return 'language-javascript';
        } else {
            return 'language-text';
        }
    };

    // Determine content type and format accordingly
    const formatContent = (content: any, contentType: string) => {
        if (!content) return "No content";

        // Handle string content
        if (typeof content === 'string') {
            // Check for JSON
            if (contentType?.includes('application/json') || 
                (content.trim().startsWith('{') && content.trim().endsWith('}')) ||
                (content.trim().startsWith('[') && content.trim().endsWith(']'))) {
                try {
                    const parsed = JSON.parse(content);
                    return (
                        <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm font-mono">
                            <code 
                                dangerouslySetInnerHTML={{ 
                                    __html: JSON.stringify(parsed, null, 2)
                                        .replace(/&/g, '&amp;')
                                        .replace(/</g, '&lt;')
                                        .replace(/>/g, '&gt;')
                                        .replace(/"([^"]+)":/g, '<span class="text-[#6f42c1] dark:text-[#c586c0]">"$1"</span>:')
                                        .replace(/: "(.*?)"/g, ': <span class="text-[#032f62] dark:text-[#ce9178]">"$1"</span>')
                                        .replace(/: (\d+)/g, ': <span class="text-[#005cc5] dark:text-[#b5cea8]">$1</span>')
                                        .replace(/: (true|false|null)/g, ': <span class="text-[#005cc5] dark:text-[#569cd6]">$1</span>')
                                }}
                            />
                        </pre>
                    );
                } catch (e) {
                    // If JSON parsing fails, show the content as text with error message
                    console.error('JSON parse error:', e);
                    return (
                        <>
                            <div className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 p-3 rounded-md mb-3 text-sm">
                                <strong>JSON Parse Error:</strong> {(e as Error).message}
                            </div>
                            <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm font-mono">
                                <code>{content}</code>
                            </pre>
                        </>
                    );
                }
            }
            
            // Check for XML
            else if (contentType?.includes('xml') || isXMLContent(content)) {
                const formattedXML = formatXML(content);
                return (
                    <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm font-mono">
                        <code dangerouslySetInnerHTML={{ 
                            __html: formattedXML
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/(&lt;\/?[a-zA-Z][^&gt;]*&gt;)/g, '<span class="text-[#22863a] dark:text-[#4ec9b0]">$1</span>')
                                .replace(/"([^"]*)"/g, '"<span class="text-[#032f62] dark:text-[#ce9178]">$1</span>"')
                        }} />
                    </pre>
                );
            }
            
            // HTML content
            else if (contentType?.includes('text/html')) {
                return (
                    <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm">
                        <div className="html-preview border border-dashed border-gray-300 dark:border-gray-600 p-2 mb-2 max-h-[300px] overflow-auto bg-white dark:bg-gray-900">
                            <div dangerouslySetInnerHTML={{ __html: content }} />
                        </div>
                        <pre className="mt-2 font-mono">
                            <code dangerouslySetInnerHTML={{ 
                                __html: content
                                    .replace(/&/g, '&amp;')
                                    .replace(/</g, '&lt;')
                                    .replace(/>/g, '&gt;')
                                    .replace(/(&lt;\/?[a-zA-Z][^&gt;]*&gt;)/g, '<span class="text-[#22863a] dark:text-[#4ec9b0]">$1</span>')
                                    .replace(/"([^"]*)"/g, '"<span class="text-[#032f62] dark:text-[#ce9178]">$1"</span>"')
                            }} />
                        </pre>
                    </div>
                );
            }
            
            // CSS content
            else if (contentType?.includes('text/css')) {
                return (
                    <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm font-mono">
                        <code dangerouslySetInnerHTML={{ 
                            __html: content
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/([^{]*)\{/g, '<span class="text-[#22863a] dark:text-[#4ec9b0]">$1</span>{')
                                .replace(/([^:]*): ([^;]*);/g, '<span class="text-[#6f42c1] dark:text-[#9cdcfe]">$1</span>: <span class="text-[#032f62] dark:text-[#ce9178]">$2</span>;')
                        }} />
                    </pre>
                );
            }
            
            // JavaScript content
            else if (contentType?.includes('javascript')) {
                return (
                    <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm font-mono">
                        <code>{content}</code>
                    </pre>
                );
            }
            
            // Plain text or other content types
            else {
                return (
                    <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm font-mono">
                        <code>{content}</code>
                    </pre>
                );
            }
        }

        // Object content - make sure it's properly styled
        if (typeof content === 'object') {
            try {
                return (
                    <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm font-mono">
                        <code 
                            dangerouslySetInnerHTML={{ 
                                __html: JSON.stringify(content, null, 2)
                                    .replace(/&/g, '&amp;')
                                    .replace(/</g, '&lt;')
                                    .replace(/>/g, '&gt;')
                                    .replace(/"([^"]+)":/g, '<span class="text-[#6f42c1] dark:text-[#c586c0]">"$1"</span>:')
                                    .replace(/: "(.*?)"/g, ': <span class="text-[#032f62] dark:text-[#ce9178]">$1"</span>')
                                    .replace(/: (\d+)/g, ': <span class="text-[#005cc5] dark:text-[#b5cea8]">$1</span>')
                                    .replace(/: (true|false|null)/g, ': <span class="text-[#005cc5] dark:text-[#569cd6]">$1</span>')
                            }}
                        />
                    </pre>
                );
            } catch (e) {
                return (
                    <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm font-mono">
                        <code>{String(content)}</code>
                    </pre>
                );
            }
        }

        // Fallback for any other type
        return (
            <pre className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-md overflow-auto text-sm font-mono">
                <code>{String(content)}</code>
            </pre>
        );
    };

    if (!requestData) return null;

    return (
        <Dialog open={isOpen} onOpenChange={() => onClose()}>
            <WideDialogContent
                className="w-full max-w-7xl min-h-[80vh] max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex flex-row items-center justify-between">
                    <div>
                        <DialogTitle className="flex items-center gap-3">
                            <Badge className={getMethodBadgeColor(requestData.request.method)}>
                                {requestData.request.method}
                            </Badge>
                            <span className="truncate">{requestData.request.path}</span>
                            <Badge className={getStatusBadgeColor(requestData.response.statusCode)}>
                                {requestData.response.statusCode}
                            </Badge>
                        </DialogTitle>
                        <DialogDescription>
                            {formatDate(requestData.timestamp)} · {requestData.duration}ms
                        </DialogDescription>
                    </div>
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

                    <TabsContent value="request" className="flex-1 overflow-auto p-2">
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

                    <TabsContent value="response" className="flex-1 overflow-auto p-2">
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
            </WideDialogContent>
        </Dialog>
    );
}