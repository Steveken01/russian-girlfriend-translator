import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Copy, ArrowRightLeft, Languages, Sun, Moon, Check, X, AlertCircle } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import { useTheme } from './contexts/ThemeContext';



type Language = 'en' | 'ru';

interface TranslationRequest {
  text: string;
  sourceLang: Language;
  targetLang: Language;
}

export default function TranslatorScreen() {
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState<Language>('en');
  const [targetLang, setTargetLang] = useState<Language>('ru');
  const { toggleTheme, isDark } = useTheme();
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;


  useEffect(() => {
    // Initial animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();


  }, [fadeAnim, scaleAnim]);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('Copied');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = (message: string = 'Copied', type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(type === 'error' ? 3000 : 2000),
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToastVisible(false));
  };

  // Custom term corrections function for accurate Russian translations
  const applyCustomCorrections = (text: string, isToRussian: boolean): string => {
    if (!isToRussian) return text;
    
    const corrections: Record<string, string> = {
      // Apps and services
      'WhatsApp': 'Ватсап',
      'whatsapp': 'ватсап',
      'Whatsapp': 'Ватсап',
      'Telegram': 'Телеграм',
      'telegram': 'телеграм',
      'CEO': 'генеральный директор',
      'ceo': 'генеральный директор',
      
      // Meals - accurate Russian timing
      'breakfast': 'завтрак',
      'Breakfast': 'Завтрак',
      'lunch': 'обед',
      'Lunch': 'Обед',
      'dinner': 'ужин',
      'Dinner': 'Ужин',
      'brunch': 'поздний завтрак',
      'Brunch': 'Поздний завтрак',
      'supper': 'ужин',
      'Supper': 'Ужин',
      
      // Additional meal-related terms
      'snack': 'перекус',
      'Snack': 'Перекус',
      'tea time': 'чаепитие',
      'Tea time': 'Чаепитие',
      'coffee break': 'кофе-брейк',
      'Coffee break': 'Кофе-брейк',
      'midnight snack': 'ночной перекус',
      'Midnight snack': 'Ночной перекус',
      
      // Time-related meal expressions
      'morning meal': 'утренний прием пищи',
      'Morning meal': 'Утренний прием пищи',
      'evening meal': 'вечерний прием пищи',
      'Evening meal': 'Вечерний прием пищи',
      'midday meal': 'дневной прием пищи',
      'Midday meal': 'Дневной прием пищи',
    };
    
    let correctedText = text;
    Object.entries(corrections).forEach(([eng, rus]) => {
      const regex = new RegExp(`\\b${eng}\\b`, 'g');
      correctedText = correctedText.replace(regex, rus);
    });
    
    return correctedText;
  };

  const translationMutation = useMutation({
    mutationFn: async ({ text, sourceLang, targetLang }: TranslationRequest) => {
      console.log('Starting translation:', { text, sourceLang, targetLang });
      
      const systemPrompt = sourceLang === 'en' 
        ? `You are a Russian female translator assistant. Your task is to translate text from English to Russian as if a Russian woman is speaking/texting to a Russian man.

CRITICAL RULES:
1. ALWAYS use feminine verb forms for the speaker (ending in -ла, -ла бы, etc.)
2. The speaker is female, so use feminine forms: "Я жила" (NOT "Я жил"), "Я была" (NOT "Я был"), "Я хотела" (NOT "Я хотел")
3. Use informal "ты" form when addressing the recipient
4. Keep the tone natural and conversational
5. DO NOT add affectionate words unless they exist in the original English
6. Maintain emotional tone but keep it authentic

Examples of correct feminine forms:
- "I lived" → "Я жила" (NOT "Я жил")
- "I was" → "Я была" (NOT "Я был") 
- "I wanted" → "Я хотела" (NOT "Я хотел")
- "I went" → "Я пошла" (NOT "Я пошёл")
- "I did" → "Я сделала" (NOT "Я сделал")
- "I miss" → "Я скучаю"
- "I think" → "Я думаю"

IMPORTANT TERM TRANSLATIONS:
- WhatsApp → Ватсап
- Telegram → Телеграм  
- CEO → генеральный директор
- breakfast → завтрак
- lunch → обед
- dinner → ужин
- brunch → поздний завтрак
- supper → ужин

Output ONLY the Russian translation, no explanations.

Text to translate:`
        : `You are a professional translator. Translate the following Russian text to English.

Rules:
- Provide accurate, natural English translation
- Maintain the original tone and meaning
- Use appropriate formality level based on context
- Output ONLY the English translation, no explanations

Text to translate:`;

      const makeRequest = async (attemptNumber: number): Promise<string> => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          
          console.log(`Translation attempt ${attemptNumber}:`, 'https://toolkit.rork.com/text/llm/');
          
          const requestBody = {
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text.trim() }
            ]
          };
          
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          };
          
          if (Platform.OS === 'web') {
            console.log('Running on web platform');
          }
          
          console.log('Sending request with body:', JSON.stringify(requestBody).substring(0, 200));
          
          const response = await fetch('https://toolkit.rork.com/text/llm/', {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
            mode: Platform.OS === 'web' ? 'cors' : undefined,
            credentials: Platform.OS === 'web' ? 'omit' : undefined,
          } as RequestInit);

          clearTimeout(timeoutId);
          console.log('Translation response status:', response.status);
          console.log('Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));
          
          if (!response.ok) {
            let errorDetails = '';
            try {
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const errorData = await response.json();
                errorDetails = errorData.error || errorData.message || JSON.stringify(errorData);
              } else {
                errorDetails = await response.text();
              }
              console.error('Translation API error response:', errorDetails);
            } catch (e) {
              console.error('Could not read error response:', e);
            }
            
            if (response.status === 500) {
              throw new Error('Server error. The translation service is experiencing issues.');
            } else if (response.status === 502 || response.status === 503) {
              throw new Error('Service unavailable. Please try again in a moment.');
            } else if (response.status === 504) {
              throw new Error('Request timed out. Try a shorter text.');
            } else if (response.status === 429) {
              throw new Error('Too many requests. Please wait a moment.');
            } else if (response.status === 400) {
              throw new Error('Invalid request. Please try different text.');
            } else if (response.status === 401 || response.status === 403) {
              throw new Error('Access denied. Please try again.');
            } else if (response.status === 404) {
              throw new Error('Translation service not found.');
            } else if (response.status >= 500) {
              throw new Error(`Server error (${response.status}). Please try again.`);
            } else {
              throw new Error(`Translation failed (${response.status}). ${errorDetails || 'Please try again.'}`);
            }
          }

          const responseText = await response.text();
          console.log('Raw response:', responseText);
          
          let data;
          try {
            data = JSON.parse(responseText);
          } catch (e) {
            console.error('Failed to parse JSON:', e);
            throw new Error('Invalid response from server. Please try again.');
          }
          
          console.log('Parsed response data:', data);
          
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid response format');
          }
          
          if (!data.completion) {
            console.error('No completion in response:', data);
            throw new Error('No translation received');
          }
          
          let translation = data.completion.trim();
          
          translation = translation
            .replace(/\s*—\s*/g, ' ')
            .replace(/\s*–\s*/g, ' ')
            .replace(/\s*-\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[\s\-—–]+|[\s\-—–]+$/g, '')
            .trim();
          
          translation = applyCustomCorrections(translation, targetLang === 'ru');
          
          console.log('Translation successful:', translation);
          return translation;
        } catch (error) {
          console.error(`Translation attempt ${attemptNumber} error:`, error);
          
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              throw new Error('Request timed out. Please check your connection and try again.');
            }
            if (error.name === 'TypeError' && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
              if (Platform.OS === 'web') {
                throw new Error('Connection error. Please check your internet or try refreshing the page.');
              }
              throw new Error('Cannot connect to translation service. Please check your internet connection.');
            }
            
            if (Platform.OS === 'web' && error.message.includes('CORS')) {
              throw new Error('Connection blocked. Please try again.');
            }
            
            if (error.message.includes('Server error') || 
                error.message.includes('Service') || 
                error.message.includes('Translation') ||
                error.message.includes('Network') ||
                error.message.includes('Request') ||
                error.message.includes('Access')) {
              throw error;
            }
          }
          
          throw new Error('Translation failed. Please check your connection and try again.');
        }
      };

      try {
        return await makeRequest(1);
      } catch (firstError) {
        console.log('First attempt failed, retrying...', firstError);
        
        const isNetworkError = firstError instanceof Error && 
          (firstError.message.includes('Network') || 
           firstError.message.includes('connection') ||
           firstError.message.includes('connect') ||
           firstError.message.includes('Failed to fetch') ||
           firstError.message.includes('timed out'));
        
        if (isNetworkError) {
          console.log('Network error detected, waiting 3 seconds before retry...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          try {
            console.log('Attempting second request...');
            return await makeRequest(2);
          } catch (secondError) {
            console.error('Second attempt also failed:', secondError);
            if (secondError instanceof Error && secondError.message.includes('Server error')) {
              throw secondError;
            }
            throw new Error('Connection failed. Please check your internet and try again 💡');
          }
        }
        
        throw firstError;
      }
    },
    onSuccess: (translation) => {
      setTranslatedText(translation);
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    },
    onError: (error) => {
      console.error('Translation mutation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Translation failed';
      showToast(errorMessage, 'error');
      setTranslatedText('');
    },
  });

  const handleTranslate = () => {
    const trimmedText = inputText.trim();
    if (!trimmedText) {
      showToast('Please enter some text to translate', 'error');
      return;
    }

    if (trimmedText.length > 5000) {
      showToast('Text is too long. Please keep it under 5000 characters.', 'error');
      return;
    }

    // Clear previous translation immediately
    setTranslatedText('');

    Keyboard.dismiss();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    translationMutation.mutate({
      text: trimmedText,
      sourceLang,
      targetLang,
    });
  };

  const handleSwapLanguages = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    const tempLang = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(tempLang);
    
    // Clear input field when swapping languages
    setInputText('');
    setTranslatedText('');
  };

  const handleCopy = async () => {
    if (!translatedText) return;
    
    try {
      await Clipboard.setStringAsync(translatedText);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast('Copied', 'success');
    } catch (error) {
      console.error('Copy failed:', error);
      showToast('Copy failed', 'error');
    }
  };

  const handleClear = () => {
    setInputText('');
    setTranslatedText('');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const getLanguageLabel = (lang: Language) => {
    return lang === 'en' ? 'English' : 'Русский';
  };

  const getThemeColors = () => {
    if (isDark) {
      return {
        gradient: ['#0D1117', '#161B22', '#21262D'],
        cardBackground: '#21262D',
        textPrimary: '#F0F6FC',
        textSecondary: 'rgba(240, 246, 252, 0.8)',
        inputBackground: '#30363D',
        inputText: '#F0F6FC',
        placeholderText: '#7D8590',
        resultBackground: '#161B22',
        copyButtonBackground: '#30363D',
      };
    }
    return {
      gradient: ['#0052CC', '#DC143C', '#FFFFFF'],
      cardBackground: '#FFFFFF',
      textPrimary: '#1a1a1a',
      textSecondary: 'rgba(255, 255, 255, 0.95)',
      inputBackground: '#F8F9FA',
      inputText: '#1a1a1a',
      placeholderText: '#6c757d',
      resultBackground: '#F0F8FF',
      copyButtonBackground: '#FFFFFF',
    };
  };

  const colors = getThemeColors();

  return (
    <LinearGradient
      colors={colors.gradient as any}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <Animated.View
                style={[
                  styles.header,
                  {
                    opacity: fadeAnim,
                    transform: [{ scale: scaleAnim }],
                  },
                ]}
              >
                <Languages size={32} color="#fff" />
                <Text style={styles.title}>Ru Translate 🇷🇺</Text>
              </Animated.View>
              
              <TouchableOpacity
                onPress={toggleTheme}
                style={styles.themeToggle}
                testID="theme-toggle"
              >
                <View style={[styles.toggleSwitch, isDark && styles.toggleSwitchActive]}>
                  <Animated.View style={[styles.toggleSlider, isDark && styles.toggleSliderActive]}>
                    {isDark ? (
                      <Moon size={12} color="#fff" />
                    ) : (
                      <Sun size={12} color="#333" />
                    )}
                  </Animated.View>
                </View>
                <Text style={[styles.themeLabel, { color: colors.textSecondary }]}>
                  {isDark ? 'Dark' : 'Light'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>Russian Girlfriend Translator</Text>

            <Animated.View
              style={[
                styles.card,
                { backgroundColor: colors.cardBackground },
                {
                  opacity: fadeAnim,
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              <View style={styles.languageSelector}>
                <View style={[styles.languageBox, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.languageLabel, { color: colors.textPrimary }]}>{getLanguageLabel(sourceLang)}</Text>
                </View>
                
                <TouchableOpacity
                  onPress={handleSwapLanguages}
                  style={[styles.swapButton, { backgroundColor: colors.inputBackground }]}
                  testID="swap-languages"
                >
                  <ArrowRightLeft size={20} color="#0052CC" />
                </TouchableOpacity>
                
                <View style={[styles.languageBox, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.languageLabel, { color: colors.textPrimary }]}>{getLanguageLabel(targetLang)}</Text>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.textInputWrapper}>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.inputBackground, color: colors.inputText }]}
                    placeholder={sourceLang === 'en' ? "Type your message..." : "Напиши сообщение..."}
                    placeholderTextColor={colors.placeholderText}
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    testID="input-text"
                  />
                  {(inputText || translatedText) && (
                    <TouchableOpacity
                      onPress={handleClear}
                      style={styles.clearButton}
                      testID="clear-button"
                    >
                      <View style={styles.clearButtonInner}>
                        <X size={20} color="#666666" strokeWidth={2} />
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.translateButton, (translationMutation.isPending || !inputText.trim()) && styles.translateButtonDisabled]}
                onPress={handleTranslate}
                disabled={translationMutation.isPending || !inputText.trim()}
                testID="translate-button"
              >
                <LinearGradient
                  colors={['#DC143C', '#0052CC']}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {translationMutation.isPending ? (
                    <>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[styles.translateButtonText, { marginLeft: 8 }]}>Translating...</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.translateButtonText}>Translate 🇷🇺</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {translatedText ? (
                <Animated.View
                  style={[
                    styles.resultContainer,
                    { backgroundColor: colors.resultBackground },
                    {
                      opacity: fadeAnim,
                      transform: [{ scale: scaleAnim }],
                    },
                  ]}
                >
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultLabel}>Translation</Text>
                    <TouchableOpacity
                      onPress={handleCopy}
                      style={[styles.copyButton, { backgroundColor: colors.copyButtonBackground }]}
                      testID="copy-button"
                    >
                      <Copy size={20} color="#0052CC" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.resultText, { color: colors.textPrimary }]} selectable testID="translated-text">
                    {translatedText}
                  </Text>
                </Animated.View>
              ) : null}
            </Animated.View>

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>Made with love 💕</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        
        {toastVisible && (
          <Animated.View
            style={[
              styles.toast,
              toastType === 'error' && styles.toastError,
              {
                opacity: toastAnim,
                transform: [
                  {
                    translateY: toastAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [100, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.toastContent}>
              <View style={[styles.toastIcon, toastType === 'error' && styles.toastIconError]}>
                {toastType === 'success' ? (
                  <Check size={16} color="#ffffff" strokeWidth={3} />
                ) : (
                  <AlertCircle size={16} color="#ffffff" strokeWidth={3} />
                )}
              </View>
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          </Animated.View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 8,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 30,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  languageBox: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  languageLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  swapButton: {
    marginHorizontal: 12,
    padding: 8,
    backgroundColor: '#F5F5F7',
    borderRadius: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  textInputWrapper: {
    position: 'relative',
  },
  textInput: {
    backgroundColor: '#F5F5F7',
    borderRadius: 16,
    padding: 16,
    paddingRight: 50,
    fontSize: 16,
    color: '#333',
    minHeight: 120,
    maxHeight: 200,
  },
  clearButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  translateButton: {
    marginBottom: 20,
    overflow: 'hidden',
    borderRadius: 16,
  },
  translateButtonDisabled: {
    opacity: 0.7,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
    gap: 8,
  },
  translateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buttonIcon: {
    marginLeft: 4,
  },
  resultContainer: {
    backgroundColor: '#F0F8FF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 82, 204, 0.2)',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC143C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  copyButton: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 82, 204, 0.1)',
  },
  resultText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  footer: {
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 10,
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },

  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: '#333333',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    maxWidth: '80%',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toastIcon: {
    width: 20,
    height: 20,
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastIconError: {
    backgroundColor: '#F44336',
  },
  toastError: {
    backgroundColor: '#424242',
  },
  toastText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 8,
  },
  themeToggle: {
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  toggleSwitch: {
    width: 50,
    height: 26,
    backgroundColor: '#ccc',
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: '#2196F3',
  },
  toggleSlider: {
    width: 22,
    height: 22,
    backgroundColor: '#fff',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleSliderActive: {
    transform: [{ translateX: 24 }],
  },
  themeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  clearButtonInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});