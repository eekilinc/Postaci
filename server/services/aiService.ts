import { Email } from '../types.js';

export class AIService {
  /**
   * Summarizes an email or an entire thread into actionable bullet points
   */
  public static async summarizeEmail(email: Email): Promise<string> {
    const text = (email.bodyText || email.snippet).trim();

    if (text.length < 50) {
      return `Kısa İleti: "${text}"`;
    }

    // Heuristic & NLP summary generator
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    const keyPoints: string[] = [];

    // Detect action items or dates
    const datePattern = /(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|saat|tarihinde|günü|\d{1,2}:\d{2})/i;
    const taskPattern = /(yapalım|tamamlandı|gerekli|lütfen|inceler misin|toplantı|kontrol|rapor)/i;

    for (const s of sentences) {
      if (keyPoints.length < 3 && (datePattern.test(s) || taskPattern.test(s))) {
        keyPoints.push(s.trim());
      }
    }

    if (keyPoints.length === 0) {
      keyPoints.push(sentences[0]);
      if (sentences.length > 1) keyPoints.push(sentences[1]);
    }

    return `📌 Özet:\n• ${keyPoints.join('\n• ')}`;
  }

  /**
   * Generates 3 contextual smart replies for one-click responding
   */
  public static async generateSmartReplies(email: Email): Promise<string[]> {
    const text = (email.bodyText || email.snippet).toLowerCase();
    const sender = email.fromName.split(' ')[0] || 'Merhaba';

    if (text.includes('toplantı') || text.includes('saat') || text.includes('uygun mudur')) {
      return [
        `Harika, ${sender}. Belirttiğin saatte toplantıya katılıyorum.`,
        `Bilgilendirme için teşekkürler, takvimime ekledim.`,
        `O saatte başka bir görüşmem var, alternatif bir saat belirleyebilir miyiz?`
      ];
    }

    if (text.includes('teşekkür') || text.includes('eline sağlık') || text.includes('tebrik')) {
      return [
        `Rica ederim, her zaman!`,
        `Çok teşekkürler, birlikte başardık.`,
        `İyi çalışmalar dilerim!`
      ];
    }

    if (text.includes('rapor') || text.includes('doküman') || text.includes('incele')) {
      return [
        `Dosyayı aldım ${sender}, gün içinde inceleyip dönüş yapacağım.`,
        `Eline sağlık, detayları kontrol edip geri bildirimde bulunacağım.`,
        `Rapor ulaştı, teşekkürler.`
      ];
    }

    return [
      `Bilgilendirme için teşekkür ederim ${sender}.`,
      `Konuyu inceleyip en kısa sürede dönüş yapacağım.`,
      `Tamamdır, anlaşıldı. İyi çalışmalar!`
    ];
  }

  /**
   * Enhances / transforms email draft text (Formal, Friendly, Concise, Expand, Fix Grammar)
   */
  public static async polishText(text: string, style: 'formal' | 'friendly' | 'concise' | 'fix_grammar'): Promise<string> {
    if (!text || text.trim().length === 0) return text;

    const clean = text.trim();

    switch (style) {
      case 'formal':
        return `Sayın Yetkili / İlgili,\n\n${clean}\n\nKonuyla ilgili değerlendirmelerinizi rica eder, iyi çalışmalar dilerim.\n\nSaygılarımla,`;
      case 'friendly':
        return `Selamlar,\n\n${clean}\n\nUmarım her şey yolundadır! Herhangi bir sorunuz olursa lütfen çekinmeden iletin.\n\nSevgiler,`;
      case 'concise':
        return `${clean.split('.').slice(0, 2).join('.')}. Detaylar için iletişime geçebilirsiniz.`;
      case 'fix_grammar':
      default:
        // Capitalize sentences and clean up double spaces
        return clean.replace(/(^\s*|\.\s*)([a-zçğışöü])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    }
  }

  /**
   * Analyzes an email for potential phishing, spoofing or suspicious links
   */
  public static analyzeSecurity(email: Email): {
    score: number; // 0 to 100 (0: safe, 100: critical threat)
    level: 'safe' | 'low' | 'medium' | 'high';
    reasons: string[];
    hasBlockedImages: boolean;
  } {
    const reasons: string[] = [];
    let score = 0;

    const lowerSubject = email.subject.toLowerCase();
    const lowerBody = (email.bodyText + ' ' + email.bodyHtml).toLowerCase();

    // Suspicious keywords
    if (/şifreniz.*(doldu|sıfırla|acil|hemen)/i.test(lowerSubject) || /şifreniz.*(doldu|sıfırla|acil|hemen)/i.test(lowerBody)) {
      score += 35;
      reasons.push('İleti içerisinde acil şifre sıfırlama veya hesap güvenliği uyarısı tespit edildi.');
    }

    if (/kredi kartı|hesap numarası|iban|ödeme dekontu|fatura borcu/i.test(lowerSubject) && !email.fromEmail.includes('banka')) {
      score += 25;
      reasons.push('Finansal talep veya ödeme uyarısı içeriyor.');
    }

    // External image tracking check
    const hasExternalImages = /<img[^>]+src=["']https?:\/\//i.test(email.bodyHtml);
    if (hasExternalImages) {
      score += 10;
      reasons.push('Gizlilik riski oluşturan harici izleme görselleri içeriyor.');
    }

    // Check sender domain vs display name
    const domain = email.fromEmail.split('@')[1] || '';
    if (email.fromName.toLowerCase().includes('google') && !domain.includes('google.com')) {
      score += 45;
      reasons.push('Gönderici adı "Google" görünüyor ancak alan adı sahte.');
    }

    let level: 'safe' | 'low' | 'medium' | 'high' = 'safe';
    if (score >= 50) level = 'high';
    else if (score >= 30) level = 'medium';
    else if (score > 0) level = 'low';

    return {
      score: Math.min(100, score),
      level,
      reasons,
      hasBlockedImages: hasExternalImages
    };
  }
}
