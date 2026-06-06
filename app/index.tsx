import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const API_URL = String(process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");

if (!API_URL) {
  throw new Error("EXPO_PUBLIC_API_URL is missing");
}

type PortalSchedule = {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject?: { name?: string; coefficient?: number };
  teacher?: {
    user?: {
      firstName?: string;
      lastName?: string;
    };
  };
};

type PortalGrade = {
  id: string;
  examType: string;
  score: number;
  comments?: string | null;
  subject?: { name?: string; coefficient?: number };
  createdAt?: string;
};

type PortalAttendance = {
  id: string;
  date: string;
  status: string;
  remarks?: string | null;
  schedule?: {
    subject?: { name?: string };
    dayOfWeek?: string;
    startTime?: string;
    endTime?: string;
  };
};

type ChildPortalRecord = {
  id?: string;
  user?: {
    firstName?: string;
    lastName?: string;
    profileImage?: string | null;
  };
  class?: {
    name?: string;
    schedules?: PortalSchedule[];
  };
  grades?: PortalGrade[];
  attendances?: PortalAttendance[];
};

type ParentPortalResponse = {
  id: string;
  userId: string;
  children?: ChildPortalRecord[];
};

type ChildEnrollmentRequestRow = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  requestedLevel?: string | null;
  note?: string | null;
  status: string;
  adminNote?: string | null;
  createdAt?: string;
  reviewedAt?: string | null;
  approvedStudent?: {
    user?: {
      firstName?: string;
      lastName?: string;
    };
    class?: {
      name?: string;
    } | null;
  } | null;
};

type SubjectAverage = {
  subjectName: string;
  average: number;
  count: number;
};

function getProfileImageUrl(profileImage?: string | null) {
  if (!profileImage) return null;

  if (profileImage.startsWith('http://') || profileImage.startsWith('https://')) {
    return profileImage;
  }

  return `${API_URL}${profileImage}`;
}

function getInitials(firstName?: string, lastName?: string) {
  const first = firstName?.trim()?.[0] ?? '';
  const last = lastName?.trim()?.[0] ?? '';
  const initials = `${first}${last}`.trim();

  return initials || '?';
}

function ChildAvatar({ child }: { child: ChildPortalRecord }) {
  const imageUrl = getProfileImageUrl(child?.user?.profileImage);
  const initials = getInitials(child?.user?.firstName, child?.user?.lastName);

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={styles.avatarImage}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );
}


function translateDay(value?: string) {
  if (!value) return '';

  const normalized = value.toLowerCase();

  if (normalized === 'monday' || normalized === 'lundi') return '\u0627\u0644\u0625\u062b\u0646\u064a\u0646';
  if (normalized === 'tuesday' || normalized === 'mardi') return '\u0627\u0644\u062b\u0644\u0627\u062b\u0627\u0621';
  if (normalized === 'wednesday' || normalized === 'mercredi') return '\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621';
  if (normalized === 'thursday' || normalized === 'jeudi') return '\u0627\u0644\u062e\u0645\u064a\u0633';
  if (normalized === 'friday' || normalized === 'vendredi') return '\u0627\u0644\u062c\u0645\u0639\u0629';
  if (normalized === 'saturday' || normalized === 'samedi') return '\u0627\u0644\u0633\u0628\u062a';
  if (normalized === 'sunday' || normalized === 'dimanche') return '\u0627\u0644\u0623\u062d\u062f';

  return value;
}

function translateAttendanceStatus(status?: string) {
  if (!status) return '-';

  if (status === 'PRESENT') return '\u062d\u0627\u0636\u0631';
  if (status === 'ABSENT') return '\u063a\u0627\u0626\u0628';
  if (status === 'LATE') return '\u0645\u062a\u0623\u062e\u0631';

  return status;
}



function formatGradeCount(count: number) {
  if (count === 1) return '\u0627\u0639\u062a\u0645\u0627\u062f\u064b\u0627 \u0639\u0644\u0649 \u0639\u062f\u062f \u0648\u0627\u062d\u062f';
  if (count === 2) return '\u0627\u0639\u062a\u0645\u0627\u062f\u064b\u0627 \u0639\u0644\u0649 \u0639\u062f\u062f\u064a\u0646';
  return `\u0627\u0639\u062a\u0645\u0627\u062f\u064b\u0627 \u0639\u0644\u0649 ${count} \u0623\u0639\u062f\u0627\u062f`;
}

function translateExamType(value?: string | null) {
  const text = String(value ?? '').trim();

  if (!text) return '-';

  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[??]/g, '')
    .replace(/n\s*[??]?\s*/g, 'n')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const compact = normalized.replace(/\s+/g, '');

  if (compact.includes('notification')) {
    return '\u0625\u0634\u0639\u0627\u0631 \u0639\u062f\u062f';
  }

  if (compact.includes('synthese') || compact.includes('synthse')) {
    return '\u0641\u0631\u0636 \u062a\u0623\u0644\u064a\u0641\u064a';
  }

  if (compact.includes('devoir')) {
    if (compact.includes('1')) {
      return '\u0641\u0631\u0636 \u0645\u0631\u0627\u0642\u0628\u0629 \u0639\u062f\u062f 1';
    }

    if (compact.includes('2')) {
      return '\u0641\u0631\u0636 \u0645\u0631\u0627\u0642\u0628\u0629 \u0639\u062f\u062f 2';
    }

    return '\u0641\u0631\u0636';
  }

  return text;
}

function translateGradeComment(value?: string | null) {
  const text = String(value ?? '').trim();

  if (!text) return '';

  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, 'e')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.includes('grade notification test')) return '\u0627\u062e\u062a\u0628\u0627\u0631 \u0625\u0634\u0639\u0627\u0631 \u0627\u0644\u0639\u062f\u062f';
  if (normalized.includes('tres bon trimestre') || normalized.includes('trs bon trimestre')) return '\u062b\u0644\u0627\u062b\u064a \u0645\u0645\u062a\u0627\u0632';
  if (normalized.includes('bon travail')) return '\u0639\u0645\u0644 \u062c\u064a\u062f';

  return text;
}

function computeSubjectAverages(grades: PortalGrade[]): SubjectAverage[] {
  const grouped = new Map<string, number[]>();

  for (const grade of grades) {
    const subjectName = grade.subject?.name ?? 'لا يوجد قسم';
    const current = grouped.get(subjectName) ?? [];
    current.push(grade.score);
    grouped.set(subjectName, current);
  }

  return [...grouped.entries()]
    .map(([subjectName, scores]) => ({
      subjectName,
      average: scores.reduce((sum, value) => sum + value, 0) / scores.length,
      count: scores.length,
    }))
    .sort((a, b) => b.average - a.average);
}

function computeSummary(grades: PortalGrade[], attendances: PortalAttendance[]) {
  const scores = grades.map((grade) => grade.score);
  const average =
    scores.length > 0
      ? scores.reduce((sum, value) => sum + value, 0) / scores.length
      : null;

  const bestScore = scores.length > 0 ? Math.max(...scores) : null;
  const absences = attendances.filter((item) => item.status === 'ABSENT').length;

  return {
    gradesCount: grades.length,
    average,
    bestScore,
    absences,
    subjectAverages: computeSubjectAverages(grades),
  };
}

function formatMobileDate(value?: string | null) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString();
}

function getChildEnrollmentStatusLabel(status?: string) {
  if (status === 'APPROVED') return 'مقبول';
  if (status === 'REJECTED') return 'مرفوض';
  return 'في انتظار المراجعة';
}


function escapeHtml(value?: string | number | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPdfDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("fr-FR");
}

function buildMobileBulletinHtml(child: ChildPortalRecord) {
  const fullName =
    `${child?.user?.firstName ?? ""} ${child?.user?.lastName ?? ""}`.trim() ||
    "الابن";

  const className = child?.class?.name || "لا يوجد قسم";
  const grades = child?.grades ?? [];
  const attendances = child?.attendances ?? [];
  const absences = attendances.filter((item) => item?.status === "ABSENT");
  const subjectAverages = computeSubjectAverages(grades);
  const average =
    grades.length > 0
      ? (grades.reduce((sum, grade) => sum + Number(grade.score ?? 0), 0) / grades.length).toFixed(2)
      : "-";

  const gradeRows =
    grades.length > 0
      ? grades
          .map(
            (grade) => `
              <tr>
                <td>${escapeHtml(grade?.subject?.name ?? "لا يوجد قسم")}</td>
                <td>${escapeHtml(translateExamType(grade?.examType))}</td>
                <td>${escapeHtml(Number(grade?.score ?? 0).toFixed(2))}/20</td>
                <td>${escapeHtml(grade?.comments ? translateGradeComment(grade.comments) : "-")}</td>
              </tr>
            `
          )
          .join("")
      : '<tr><td colspan="4">لا توجد أعداد منشورة بعد.</td></tr>';

  const averageRows =
    subjectAverages.length > 0
      ? subjectAverages
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.subjectName)}</td>
                <td>${escapeHtml(item.average.toFixed(2))}/20</td>
                <td>${escapeHtml(formatGradeCount(item.count))}</td>
              </tr>
            `
          )
          .join("")
      : '<tr><td colspan="3">لا توجد معدلات مواد بعد.</td></tr>';

  const absenceRows =
    absences.length > 0
      ? absences
          .map(
            (absence) => `
              <tr>
                <td>${escapeHtml(absence?.schedule?.subject?.name ?? "لا يوجد قسم")}</td>
                <td>${escapeHtml(formatPdfDate(absence?.date))}</td>
                <td>${escapeHtml(translateAttendanceStatus(absence?.status))}</td>
              </tr>
            `
          )
          .join("")
      : '<tr><td colspan="3">لا توجد غيابات.</td></tr>';

  return `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            direction: rtl;
            color: #111827;
            padding: 28px;
            line-height: 1.7;
          }
          .header {
            border-bottom: 2px solid #2563eb;
            padding-bottom: 14px;
            margin-bottom: 20px;
          }
          h1 {
            margin: 0;
            color: #1d4ed8;
            font-size: 24px;
          }
          h2 {
            margin-top: 24px;
            color: #374151;
            font-size: 18px;
          }
          .meta {
            color: #64748b;
            margin-top: 6px;
          }
          .summary {
            display: flex;
            gap: 12px;
            margin: 18px 0;
          }
          .box {
            flex: 1;
            border: 1px solid #dbeafe;
            border-radius: 10px;
            padding: 10px;
            background: #eff6ff;
          }
          .label {
            color: #64748b;
            font-size: 12px;
          }
          .value {
            font-size: 18px;
            font-weight: bold;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 8px;
            text-align: right;
            font-size: 12px;
          }
          th {
            background: #f8fafc;
            color: #334155;
          }
          .footer {
            margin-top: 28px;
            color: #94a3b8;
            font-size: 11px;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>دفتر الأعداد</h1>
          <div class="meta">التلميذ: ${escapeHtml(fullName)}</div>
          <div class="meta">القسم: ${escapeHtml(className)}</div>
        </div>

        <div class="summary">
          <div class="box">
            <div class="label">المعدل العام</div>
            <div class="value">${escapeHtml(average)}</div>
          </div>
          <div class="box">
            <div class="label">عدد الأعداد</div>
            <div class="value">${escapeHtml(grades.length)}</div>
          </div>
          <div class="box">
            <div class="label">عدد الغيابات</div>
            <div class="value">${escapeHtml(absences.length)}</div>
          </div>
        </div>

        <h2>معدلات المواد</h2>
        <table>
          <thead>
            <tr>
              <th>المادة</th>
              <th>المعدل</th>
              <th>عدد الأعداد</th>
            </tr>
          </thead>
          <tbody>${averageRows}</tbody>
        </table>

        <h2>الأعداد</h2>
        <table>
          <thead>
            <tr>
              <th>المادة</th>
              <th>نوع التقييم</th>
              <th>العدد</th>
              <th>ملاحظة</th>
            </tr>
          </thead>
          <tbody>${gradeRows}</tbody>
        </table>

        <h2>الغيابات</h2>
        <table>
          <thead>
            <tr>
              <th>المادة</th>
              <th>التاريخ</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>${absenceRows}</tbody>
        </table>

        <div class="footer">تم إنشاء هذا الملف من تطبيق بوابة الولي.</div>
      </body>
    </html>
  `;
}


function SummaryCards({
  grades,
  attendances,
}: {
  grades: PortalGrade[];
  attendances: PortalAttendance[];
}) {
  const summary = useMemo(
    () => computeSummary(grades, attendances),
    [grades, attendances]
  );

  const cards = [
    {
      label: 'المعدل العام',
      value: summary.average !== null ? summary.average.toFixed(2) : '-',
    },
    {
      label: 'أفضل عدد',
      value: summary.bestScore !== null ? `${summary.bestScore.toFixed(2)}/20` : '-',
    },
    {
      label: 'عدد الأعداد',
      value: String(summary.gradesCount),
    },
    {
      label: 'الغيابات',
      value: String(summary.absences),
    },
  ];

  return (
    <View style={styles.summaryGrid}>
      {cards.map((card) => (
        <View key={card.label} style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{card.label}</Text>
          <Text style={styles.summaryValue}>{card.value}</Text>
        </View>
      ))}
    </View>
  );
}

function SubjectAverageSection({ grades }: { grades: PortalGrade[] }) {
  const subjectAverages = useMemo(() => computeSubjectAverages(grades), [grades]);

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>معدلات المواد</Text>

      {subjectAverages.length === 0 ? (
        <Text style={styles.emptyText}>لا توجد معدلات مواد متوفرة بعد.</Text>
      ) : (
        subjectAverages.map((item) => (
          <View key={item.subjectName} style={styles.averageCard}>
            <View style={styles.averageHeader}>
              <Text style={styles.subjectName}>{item.subjectName}</Text>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>{item.average.toFixed(2)}/20</Text>
              </View>
            </View>
            <Text style={styles.averageMeta}>{formatGradeCount(item.count)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [portalData, setPortalData] = useState<ParentPortalResponse | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [childEnrollmentRequests, setChildEnrollmentRequests] = useState<ChildEnrollmentRequestRow[]>([]);
  const [isLoadingChildRequests, setIsLoadingChildRequests] = useState(false);
  const [isSubmittingChildRequest, setIsSubmittingChildRequest] = useState(false);
  const [childRequestForm, setChildRequestForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    requestedLevel: '',
    note: '',
  });

  const [exportingChildId, setExportingChildId] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      return Alert.alert('Error', 'Please fill in all fields');
    }

    setIsLoggingIn(true);

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.role !== 'PARENT') {
          Alert.alert(
            'وصول مرفوض',
            'تطبيق الهاتف مخصص لحساب الولي فقط.'
          );
          return;
        }

        await AsyncStorage.setItem('token', data.token);
        await AsyncStorage.setItem('role', data.role);
        setUserRole(data.role);
        setIsLoggedIn(true);
      } else {
        Alert.alert('Login Failed', data.error || 'Invalid credentials');
      }
    } catch {
      Alert.alert('Network Error', 'Cannot connect to server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = useCallback(async () => {
  await AsyncStorage.removeItem('token');
  await AsyncStorage.removeItem('role');
  setPortalData(null);
  setChildEnrollmentRequests([]);
  setIsLoggedIn(false);
}, []);

const fetchMyData = useCallback(async () => {
  setIsLoadingData(true);
  setIsLoadingChildRequests(true);

  try {
    const token = await AsyncStorage.getItem('token');

    const response = await fetch(`${API_URL}/api/my-portal`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();

    if (!response.ok) {
      Alert.alert('وصول مرفوض', data.error || 'تطبيق الهاتف مخصص لحساب الولي فقط.');
      await handleLogout();
      return;
    }

    setPortalData(data);

    const requestsResponse = await fetch(`${API_URL}/api/my-child-enrollment-requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const requestsData = await requestsResponse.json();

    if (requestsResponse.ok && Array.isArray(requestsData)) {
      setChildEnrollmentRequests(requestsData);
    } else {
      setChildEnrollmentRequests([]);
    }
  } catch {
    Alert.alert('Error', 'Failed to load your school data.');
  } finally {
    setIsLoadingData(false);
    setIsLoadingChildRequests(false);
  }
}, [handleLogout]);

const handleSubmitChildEnrollmentRequest = async () => {
  const firstName = childRequestForm.firstName.trim();
  const lastName = childRequestForm.lastName.trim();
  const dateOfBirth = childRequestForm.dateOfBirth.trim();
  const requestedLevel = childRequestForm.requestedLevel.trim();
  const note = childRequestForm.note.trim();

  if (!firstName || !lastName || !dateOfBirth) {
    Alert.alert('بيانات ناقصة', 'الاسم واللقب وتاريخ الولادة مطلوبة.');
    return;
  }

  setIsSubmittingChildRequest(true);

  try {
    const token = await AsyncStorage.getItem('token');

    const response = await fetch(`${API_URL}/api/child-enrollment-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        firstName,
        lastName,
        dateOfBirth,
        requestedLevel,
        note,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      Alert.alert('تعذر إرسال الطلب', data.error || 'حدث خطأ أثناء إرسال طلب تسجيل الابن.');
      return;
    }

    setChildRequestForm({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      requestedLevel: '',
      note: '',
    });

    Alert.alert('تم الإرسال', 'تم إرسال طلب تسجيل الابن إلى إدارة المدرسة.');
    await fetchMyData();
  } catch {
    Alert.alert('Network Error', 'Cannot connect to server.');
  } finally {
    setIsSubmittingChildRequest(false);
  }
};

useEffect(() => {
  if (isLoggedIn) {
    fetchMyData();
  }
}, [isLoggedIn, fetchMyData]);

  const renderChildEnrollmentRequestSection = () => (
    <View style={styles.childRequestSection}>
      <Text style={styles.sectionTitle}>طلب تسجيل ابن</Text>
      <Text style={styles.childRequestDescription}>
        يمكن للولي إرسال طلب تسجيل ابن، وتقوم إدارة المدرسة بمراجعته وتعيين القسم قبل إنشاء الملف الرسمي.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="اسم الابن"
        value={childRequestForm.firstName}
        onChangeText={(value) => setChildRequestForm((prev) => ({ ...prev, firstName: value }))}
      />

      <TextInput
        style={styles.input}
        placeholder="لقب الابن"
        value={childRequestForm.lastName}
        onChangeText={(value) => setChildRequestForm((prev) => ({ ...prev, lastName: value }))}
      />

      <TextInput
        style={styles.input}
        placeholder="تاريخ الولادة: YYYY-MM-DD"
        value={childRequestForm.dateOfBirth}
        onChangeText={(value) => setChildRequestForm((prev) => ({ ...prev, dateOfBirth: value }))}
      />

      <TextInput
        style={styles.input}
        placeholder="المستوى أو القسم المطلوب"
        value={childRequestForm.requestedLevel}
        onChangeText={(value) => setChildRequestForm((prev) => ({ ...prev, requestedLevel: value }))}
      />

      <TextInput
        style={[styles.input, styles.childRequestTextArea]}
        placeholder="ملاحظات اختيارية"
        multiline
        value={childRequestForm.note}
        onChangeText={(value) => setChildRequestForm((prev) => ({ ...prev, note: value }))}
      />

      <TouchableOpacity
        style={[styles.button, isSubmittingChildRequest ? styles.disabledButton : null]}
        onPress={handleSubmitChildEnrollmentRequest}
        disabled={isSubmittingChildRequest}
      >
        {isSubmittingChildRequest ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>إرسال طلب التسجيل</Text>
        )}
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: 22 }]}>طلبات التسجيل</Text>

      {isLoadingChildRequests ? (
        <Text style={styles.emptyText}>جاري تحميل طلبات التسجيل...</Text>
      ) : childEnrollmentRequests.length === 0 ? (
        <Text style={styles.emptyText}>لا توجد طلبات تسجيل أبناء بعد.</Text>
      ) : (
        childEnrollmentRequests.map((request) => {
          const statusStyle =
            request.status === 'APPROVED'
              ? styles.childRequestStatusApproved
              : request.status === 'REJECTED'
                ? styles.childRequestStatusRejected
                : styles.childRequestStatusPending;

          return (
            <View key={request.id} style={styles.childRequestCard}>
              <View style={styles.childRequestHeader}>
                <Text style={styles.childRequestName}>
                  {request.firstName} {request.lastName}
                </Text>
                <Text style={[styles.childRequestStatus, statusStyle]}>
                  {getChildEnrollmentStatusLabel(request.status)}
                </Text>
              </View>

              <Text style={styles.childRequestMeta}>
                تاريخ الولادة: {formatMobileDate(request.dateOfBirth)}
              </Text>

              <Text style={styles.childRequestMeta}>
                المستوى المطلوب: {request.requestedLevel || 'غير محدد'}
              </Text>

              {request.note ? (
                <Text style={styles.childRequestMeta}>ملاحظة: {request.note}</Text>
              ) : null}

              {request.adminNote ? (
                <Text style={styles.childRequestMeta}>رد الإدارة: {request.adminNote}</Text>
              ) : null}

              {request.approvedStudent ? (
                <Text style={styles.childRequestApprovedText}>
                  تم إنشاء ملف التلميذ: {request.approvedStudent.user?.firstName}{' '}
                  {request.approvedStudent.user?.lastName}
                  {request.approvedStudent.class?.name ? ` - ${request.approvedStudent.class.name}` : ''}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );


  const handleExportBulletin = useCallback(async (child: ChildPortalRecord) => {
    const fullName =
      `${child?.user?.firstName ?? ''} ${child?.user?.lastName ?? ''}`.trim() ||
      'الابن';
    const childKey = child?.id ?? fullName;

    try {
      setExportingChildId(childKey);

      const html = buildMobileBulletinHtml(child);
      const result = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'دفتر الأعداد PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('تم إنشاء ملف PDF', result.uri);
      }
    } catch {
      Alert.alert('تعذر استخراج PDF', 'تعذر إنشاء أو مشاركة دفتر الأعداد.');
    } finally {
      setExportingChildId(null);
    }
  }, []);

  const renderChildRecord = (child: ChildPortalRecord) => {
    const fullName =
      `${child?.user?.firstName ?? ''} ${child?.user?.lastName ?? ''}`.trim() ||
      'الابن';

    const className = child?.class?.name || 'لا يوجد قسم';
    const schedules = child?.class?.schedules ?? [];
    const grades = child?.grades ?? [];
    const attendances = child?.attendances ?? [];
    const absences = attendances.filter((a) => a?.status === 'ABSENT');
    const childKey = child?.id ?? fullName;
    const isExporting = exportingChildId === childKey;

    return (
      <View key={child?.id ?? fullName} style={styles.childRecordSection}>
        <View style={styles.childRecordHeader}>
          <View style={styles.childRecordIdentity}>
            <ChildAvatar child={child} />

            <View style={styles.childRecordTextBlock}>
              <Text style={styles.childRecordName} numberOfLines={2}>
                {fullName}
              </Text>
              <Text style={styles.profileImageStatus} numberOfLines={1}>
                {child?.user?.profileImage ? 'تم رفع الصورة' : 'لا توجد صورة'}
              </Text>
            </View>
          </View>

          <View style={styles.classBadge}>
            <Text style={styles.classBadgeText} numberOfLines={2}>
              {className}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => handleExportBulletin(child)}
          disabled={isExporting}
          style={[styles.exportPdfButton, isExporting ? styles.disabledButton : null]}
        >
          <Text style={styles.exportPdfButtonText}>
            {isExporting ? 'جاري إعداد PDF...' : 'استخراج دفتر الأعداد PDF'}
          </Text>
        </TouchableOpacity>

        <SummaryCards grades={grades} attendances={attendances} />

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>جدول الأوقات الأسبوعي</Text>
        {!child?.class || schedules.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد حصص مبرمجة بعد.</Text>
        ) : (
          <View style={styles.scheduleContainer}>
            {schedules.map((sched) => {
              const teacherLastName =
                sched?.teacher?.user?.lastName ??
                sched?.teacher?.user?.firstName ??
                'أستاذ';

              return (
                <View
                  key={sched?.id ?? `${sched?.dayOfWeek}-${sched?.startTime}`}
                  style={styles.scheduleCard}
                >
                  <View style={styles.scheduleDayTime}>
                    <Text style={styles.scheduleDay}>{translateDay(sched?.dayOfWeek) || '-'}</Text>
                    <Text style={styles.scheduleTime}>
                      {sched?.startTime ?? '-'} - {sched?.endTime ?? '-'}
                    </Text>
                  </View>
                  <View style={styles.scheduleDetails}>
                    <Text style={styles.subjectName}>{sched?.subject?.name ?? 'لا يوجد قسم'}</Text>
                    <Text style={styles.teacherName}>أستاذ {teacherLastName}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 24 }}>
          <SubjectAverageSection grades={grades} />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>آخر الأعداد</Text>
        {grades.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد أعداد منشورة بعد.</Text>
        ) : (
          grades.map((g) => (
            <View key={g?.id ?? `${g?.subject?.name}-${g?.examType}`} style={styles.gradeCard}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.subjectName}>{g?.subject?.name ?? 'لا يوجد قسم'}</Text>
                <Text style={styles.examType}>{translateExamType(g?.examType)}</Text>
                {g?.comments ? <Text style={styles.commentText}>{translateGradeComment(g.comments)}</Text> : null}
              </View>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>{g?.score ?? '-'} /20</Text>
              </View>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>الغيابات</Text>
        {absences.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد غيابات.</Text>
        ) : (
          absences.map((a) => (
            <View key={a?.id ?? `${a?.date}-${a?.status}`} style={styles.absenceCard}>
              <Text style={styles.absenceSubject}>
                {a?.schedule?.subject?.name ?? 'لا يوجد قسم'}
              </Text>
              <Text style={styles.absenceDate}>
                {a?.date ? new Date(a.date).toLocaleDateString() : '-'}
              </Text>
            </View>
          ))
        )}

        {attendances.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>سجلات الحضور والغياب</Text>
            {attendances.map((a) => (
              <View key={`${a.id}-record`} style={styles.attendanceCard}>
                <Text style={styles.attendanceSubject}>
                  {a?.schedule?.subject?.name ?? 'لا يوجد قسم'}
                </Text>
                <Text style={styles.attendanceMeta}>
                  {a?.date ? new Date(a.date).toLocaleDateString() : '-'} • {translateAttendanceStatus(a.status)}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </View>
    );
  };

  if (isLoggedIn) {
    return (
      <View style={styles.dashboardContainer}>
        <View style={styles.navbar}>
          <Text style={styles.navTitle}>بوابة الولي</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutBtnText}>خروج</Text>
          </TouchableOpacity>
        </View>

        {isLoadingData || !portalData ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>جارٍ تحميل البيانات...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>

            {userRole === 'PARENT' && (
              <View>
                <Text style={styles.parentWelcome}>مرحبا بك في بوابة الولي</Text>
                {renderChildEnrollmentRequestSection()}

                {((portalData as ParentPortalResponse)?.children ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>لا يوجد أبناء مرتبطون بحساب هذا الولي.</Text>
                ) : (
                  ((portalData as ParentPortalResponse)?.children ?? []).map((child) =>
                    renderChildRecord(child)
                  )
                )}
              </View>
            )}

            <View style={{ height: 50 }} />
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.loginBox}>
        <Text style={styles.title}>School ERP</Text>
        <Text style={styles.subtitle}>بوابة الولي</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput
            style={styles.input}
            placeholder="parent@school.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={isLoggingIn}>
          {isLoggingIn ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>دخول</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    padding: 20,
  },
  loginBox: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2563eb',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  dashboardContainer: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingTop: 50,
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  navTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutBtnText: {
    color: '#dc2626',
    fontWeight: 'bold',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#6b7280',
    fontSize: 16,
  },
  scrollArea: {
    padding: 20,
  },
  parentWelcome: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4b5563',
    marginBottom: 20,
    textAlign: 'center',
  },

  childRecordSection: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
    childRecordHeader: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingBottom: 15,
  },
  childRecordIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  childRecordTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    backgroundColor: '#e5e7eb',
    borderWidth: 2,
    borderColor: '#dbeafe',
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  childRecordName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    lineHeight: 30,
  },
  profileImageStatus: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  classBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  classBadgeText: {
    color: '#1d4ed8',
    fontWeight: '600',
    fontSize: 14,
  },

  sectionCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 6,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 15,
  },
  exportPdfButton: {
    marginTop: 14,
    marginBottom: 16,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  exportPdfButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  emptyText: {
    color: '#9ca3af',
    fontStyle: 'italic',
  },

  scheduleContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  scheduleCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
    alignItems: 'center',
  },
  scheduleDayTime: {
    width: 90,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    paddingRight: 10,
    marginRight: 10,
  },
  scheduleDay: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  scheduleTime: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  scheduleDetails: {
    flex: 1,
  },
  teacherName: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },

  gradeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  subjectName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  examType: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  commentText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 6,
  },
  scoreBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scoreText: {
    color: '#166534',
    fontWeight: 'bold',
    fontSize: 16,
  },

  averageCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  averageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  averageMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
  },

  absenceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  absenceSubject: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#991b1b',
  },
  absenceDate: {
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
  },

  attendanceCard: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  attendanceSubject: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  attendanceMeta: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  childRequestSection: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  childRequestDescription: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
    textAlign: 'right',
  },
  childRequestTextArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  disabledButton: {
    opacity: 0.65,
  },
  childRequestCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  childRequestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  childRequestName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    flex: 1,
  },
  childRequestStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  childRequestStatusPending: {
    color: '#92400e',
    backgroundColor: '#fef3c7',
  },
  childRequestStatusApproved: {
    color: '#047857',
    backgroundColor: '#d1fae5',
  },
  childRequestStatusRejected: {
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
  },
  childRequestMeta: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 3,
    textAlign: 'right',
  },
  childRequestApprovedText: {
    color: '#047857',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    fontWeight: '600',
    textAlign: 'right',
  },

});

