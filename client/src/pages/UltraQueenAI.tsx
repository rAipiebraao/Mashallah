import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AIResponse } from "@/types/api";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Send, 
  Bot, 
  Sparkles, 
  Globe, 
  Brain, 
  Cpu, 
  Mic, 
  MicOff,
  Volume2,
  VolumeX,
  RefreshCw,
  Zap,
  Crown,
  AlertCircle,
  CheckCircle,
  Loader2,
  Settings,
  History,
  Paperclip
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type AIProvider = 'auto' | 'openai' | 'anthropic' | 'perplexity' | 'mistral' | 'quantum';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: AIProvider;
  metadata?: {
    executionTime?: number;
    confidence?: number;
    model?: string;
    quantumEnhanced?: boolean;
  };
  timestamp: Date;
  status?: 'pending' | 'complete' | 'error';
}

interface ProviderStatus {
  provider: AIProvider;
  status: 'active' | 'error' | 'degraded';
  responseTime?: number;
  errorMessage?: string;
}

export default function UltraQueenAI() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState<AIProvider>('auto');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [quantumMode, setQuantumMode] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const speechSynthesis = window.speechSynthesis;

  // Fetch provider status on mount
  useEffect(() => {
    fetchProviderStatus();
    const interval = setInterval(fetchProviderStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchProviderStatus = async () => {
    try {
      const response = await fetch('/api/ultra-ai/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setProviderStatus(data.providers || []);
      }
    } catch (error) {
      console.error('Failed to fetch provider status:', error);
    }
  };

  const chatMutation = useMutation({
    mutationFn: async (data: any): Promise<AIResponse> => {
      const response = await fetch('/api/ultra-ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onSuccess: (apiResponse: AIResponse) => {
      if (apiResponse.success) {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: apiResponse.content || '',
          provider: apiResponse.provider as AIProvider,
          metadata: apiResponse.metadata,
          timestamp: new Date(),
          status: 'complete'
        };
        setMessages(prev => [...prev, assistantMessage]);
        
        // Voice output if enabled
        if (voiceEnabled && apiResponse.content) {
          speak(apiResponse.content);
        }

        // Show provider comparison if available
        if (apiResponse.providers && apiResponse.providers.length > 0) {
          toast({
            title: "Provider Comparison Complete",
            description: `${apiResponse.providers.length} providers analyzed`,
            duration: 5000,
          });
        }
      } else {
        toast({
          title: "Error",
          description: apiResponse.error || "Failed to get response",
          variant: "destructive"
        });
      }
      setIsTyping(false);
    },
    onError: (error) => {
      toast({
        title: "Connection Error",
        description: "Failed to connect to Ultra Queen AI",
        variant: "destructive"
      });
      setIsTyping(false);
    }
  });

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Get previous context (last 3 messages)
    const previousContext = messages
      .filter(m => m.role === 'assistant')
      .slice(-3)
      .map(m => m.content);

    chatMutation.mutate({
      message: input,
      provider: provider,
      compareProviders: compareMode,
      quantumMode: quantumMode,
      voiceInput: isRecording,
      previousContext
    });
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window && voiceEnabled) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      speechSynthesis.speak(utterance);
    }
  };

  const toggleVoiceRecording = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder.current = new MediaRecorder(stream);
        
        const audioChunks: BlobPart[] = [];
        mediaRecorder.current.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        mediaRecorder.current.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          // In production, send to speech-to-text API
          toast({
            title: "Voice Recording",
            description: "Voice input captured (demo mode)"
          });
        };

        mediaRecorder.current.start();
        setIsRecording(true);
      } catch (error) {
        toast({
          title: "Microphone Error",
          description: "Could not access microphone",
          variant: "destructive"
        });
      }
    } else {
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        mediaRecorder.current.stop();
        mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    toast({
      title: "History Cleared",
      description: "Conversation history has been cleared"
    });
  };

  const getProviderIcon = (provider: AIProvider) => {
    switch (provider) {
      case 'openai': return <Brain className="h-4 w-4" />;
      case 'anthropic': return <Bot className="h-4 w-4" />;
      case 'perplexity': return <Globe className="h-4 w-4" />;
      case 'mistral': return <Cpu className="h-4 w-4" />;
      case 'quantum': return <Zap className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  const getProviderColor = (provider: AIProvider) => {
    switch (provider) {
      case 'openai': return 'bg-[var(--queen-blue-green)]';
      case 'anthropic': return 'bg-[var(--queen-gold)]';
      case 'perplexity': return 'bg-[var(--queen-blue)]';
      case 'mistral': return 'bg-[var(--queen-teal)]';
      case 'quantum': return 'bg-[var(--queen-gold)]';
      default: return 'bg-[var(--queen-gray)]';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black p-4">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[var(--queen-gold)]/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[var(--queen-cyan)]/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Crown className="h-8 w-8 text-[var(--queen-gold)]" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--queen-gold)] to-[var(--queen-gold-dark)] bg-clip-text text-transparent">
              Ultra Queen AI System
            </h1>
            <Crown className="h-8 w-8 text-[var(--queen-gold)]" />
          </div>
          <p className="text-[var(--queen-gold-light)]">Multi-Provider Intelligence • Quantum Computing • Unlimited Power</p>
          
          {/* Provider Status Bar */}
          <div className="flex items-center justify-center gap-4 mt-4">
            {providerStatus.map(status => (
              <div key={status.provider} className="flex items-center gap-1">
                {getProviderIcon(status.provider)}
                <span className="text-xs text-[var(--queen-gold-light)]">{status.provider}:</span>
                {status.status === 'active' ? (
                  <CheckCircle className="h-3 w-3 text-[var(--queen-blue-green)]" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-[var(--queen-gold)]" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Settings Panel */}
          <div className="lg:col-span-1">
            <Card className="bg-[var(--queen-black)]/50 border-[var(--queen-gold)]/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-[var(--queen-gold)] flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Provider Selection */}
                <div>
                  <Label htmlFor="provider" className="text-[var(--queen-gold-light)]">AI Provider</Label>
                  <Select value={provider} onValueChange={(v) => setProvider(v as AIProvider)}>
                    <SelectTrigger id="provider" className="bg-[var(--queen-gray)] border-[var(--queen-gold)]/30 text-[var(--queen-gold-light)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--queen-gray)] border-[var(--queen-gold)]/30">
                      <SelectItem value="auto">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Auto (Best for Query)
                        </div>
                      </SelectItem>
                      <SelectItem value="openai">
                        <div className="flex items-center gap-2">
                          <Brain className="h-4 w-4" />
                          OpenAI GPT-4
                        </div>
                      </SelectItem>
                      <SelectItem value="anthropic">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          Anthropic Claude
                        </div>
                      </SelectItem>
                      <SelectItem value="perplexity">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          Perplexity Search
                        </div>
                      </SelectItem>
                      <SelectItem value="mistral">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4" />
                          Mistral AI
                        </div>
                      </SelectItem>
                      <SelectItem value="quantum">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          Quantum Mode
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Feature Toggles */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="compare" className="text-[var(--queen-gold-light)]">Compare Providers</Label>
                    <Switch 
                      id="compare"
                      checked={compareMode}
                      onCheckedChange={setCompareMode}
                      className="data-[state=checked]:bg-[var(--queen-gold)]"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="quantum" className="text-[var(--queen-gold-light)]">Quantum Mode</Label>
                    <Switch 
                      id="quantum"
                      checked={quantumMode}
                      onCheckedChange={setQuantumMode}
                      className="data-[state=checked]:bg-[var(--queen-cyan)]"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="voice" className="text-[var(--queen-gold-light)]">Voice Output</Label>
                    <Switch 
                      id="voice"
                      checked={voiceEnabled}
                      onCheckedChange={setVoiceEnabled}
                      className="data-[state=checked]:bg-[var(--queen-blue)]"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Button 
                    onClick={clearHistory}
                    className="w-full bg-[var(--queen-gray)] hover:bg-[var(--queen-dark-blue)] text-[var(--queen-gold-light)]"
                    size="sm"
                  >
                    <History className="h-4 w-4 mr-2" />
                    Clear History
                  </Button>
                  
                  <Button 
                    onClick={fetchProviderStatus}
                    className="w-full bg-[var(--queen-gray)] hover:bg-[var(--queen-dark-blue)] text-[var(--queen-gold-light)]"
                    size="sm"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Status
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chat Panel */}
          <div className="lg:col-span-3">
            <Card className="bg-[var(--queen-black)]/50 border-[var(--queen-gold)]/30 backdrop-blur-sm h-[80vh] flex flex-col">
              <CardHeader className="border-b border-[var(--queen-gold)]/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[var(--queen-gold)]">Chat Interface</CardTitle>
                  <div className="flex items-center gap-2">
                    {quantumMode && (
                      <Badge className="bg-[var(--queen-cyan)]/20 text-[var(--queen-cyan)] border-[var(--queen-cyan)]">
                        Quantum Active
                      </Badge>
                    )}
                    {compareMode && (
                      <Badge className="bg-[var(--queen-blue)]/20 text-[var(--queen-cyan)] border-[var(--queen-blue)]">
                        Compare Mode
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col p-0">
                {/* Messages Area */}
                <ScrollArea className="flex-1 p-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-12">
                      <Sparkles className="h-12 w-12 text-[var(--queen-gold)] mx-auto mb-4" />
                      <p className="text-[var(--queen-gold-light)]">Welcome to Ultra Queen AI</p>
                      <p className="text-sm text-[var(--queen-gold-light)] mt-2">Ask anything. I have unlimited capabilities.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-4 ${
                              message.role === 'user'
                                ? 'bg-[var(--queen-gold)]/20 border border-[var(--queen-gold)]/30 text-[var(--queen-gold-light)]'
                                : 'bg-[var(--queen-gray)] border border-[var(--queen-gold)]/30 text-[var(--queen-gold-light)]'
                            }`}
                          >
                            {message.role === 'assistant' && message.provider && (
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-2 h-2 rounded-full ${getProviderColor(message.provider)}`} />
                                <span className="text-xs text-[var(--queen-gold-light)]">
                                  {message.provider.toUpperCase()}
                                </span>
                                {message.metadata?.confidence && (
                                  <span className="text-xs text-[var(--queen-gray)]">
                                    ({(message.metadata.confidence * 100).toFixed(0)}% confidence)
                                  </span>
                                )}
                                {message.metadata?.executionTime && (
                                  <span className="text-xs text-[var(--queen-gray)]">
                                    {message.metadata.executionTime}ms
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="whitespace-pre-wrap">{message.content}</div>
                          </div>
                        </div>
                      ))}
                      
                      {isTyping && (
                        <div className="flex justify-start">
                          <div className="bg-[var(--queen-gray)] border border-[var(--queen-gold)]/30 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-[var(--queen-gold)]" />
                              <span className="text-[var(--queen-gold-light)]">Processing with {provider === 'auto' ? 'optimal provider' : provider}...</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Input Area */}
                <div className="p-4 border-t border-[var(--queen-gold)]/30">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder="Ask anything... I have unlimited capabilities"
                        className="min-h-[60px] bg-[var(--queen-gray)] border-[var(--queen-gold)]/30 text-[var(--queen-gold-light)] placeholder-[var(--queen-gold-light)]/50 pr-20"
                      />
                      <div className="absolute right-2 top-2 flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={toggleVoiceRecording}
                          className={`h-8 w-8 ${isRecording ? 'text-[var(--queen-gold)]' : 'text-[var(--queen-gold-light)]'} hover:text-[var(--queen-cyan)]`}
                        >
                          {isRecording ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-[var(--queen-gold-light)] hover:text-[var(--queen-cyan)]"
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      onClick={sendMessage}
                      disabled={chatMutation.isPending || !input.trim()}
                      className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                    >
                      {chatMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}