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

const API_URL = 'https://school-erp-api-3l16.onrender.com';

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

type StudentPortalShape = {
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
  children?: StudentPortalShape[];
};

type PortalResponse = StudentPortalShape | ParentPortalResponse;

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

function StudentAvatar({ student }: { student: StudentPortalShape }) {
  const imageUrl = getProfileImageUrl(student?.user?.profileImage);
  const initials = getInitials(student?.user?.firstName, student?.user?.lastName);

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
  if (count === 1) return '???????? ??? ??? ????';
  if (count === 2) return '???????? ??? ?????';
  return `???????? ??? ${count} ?????`;
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
    const subjectName = grade.subject?.name ?? 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù‚Ø³Ù…';
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
      label: 'Ø§Ù„Ù…Ø¹Ø¯Ù„ Ø§Ù„Ø¹Ø§Ù…',
      value: summary.average !== null ? summary.average.toFixed(2) : '-',
    },
    {
      label: 'Ø£ÙØ¶Ù„ Ø¹Ø¯Ø¯',
      value: summary.bestScore !== null ? `${summary.bestScore.toFixed(2)}/20` : '-',
    },
    {
      label: 'Ø¹Ø¯Ø¯ Ø§Ù„Ø£Ø¹Ø¯Ø§Ø¯',
      value: String(summary.gradesCount),
    },
    {
      label: 'Ø§Ù„ØºÙŠØ§Ø¨Ø§Øª',
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
      <Text style={styles.sectionTitle}>Ù…Ø¹Ø¯Ù„Ø§Øª Ø§Ù„Ù…ÙˆØ§Ø¯</Text>

      {subjectAverages.length === 0 ? (
        <Text style={styles.emptyText}>Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø¹Ø¯Ù„Ø§Øª Ù…ÙˆØ§Ø¯ Ù…ØªÙˆÙØ±Ø© Ø¨Ø¹Ø¯.</Text>
      ) : (
        subjectAverages.map((item) => (
          <View key={item.subjectName} style={styles.averageCard}>
            <View style={styles.averageHeader}>
              <Text style={styles.subjectName}>{item.subjectName}</Text>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>{item.average.toFixed(2)}/20</Text>
              </View>
            </View>
            <Text style={styles.averageMeta}>
              Ø§Ø¹ØªÙ…Ø§Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ {item.count} Ø¹Ø¯Ø¯
            </Text>
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
  const [portalData, setPortalData] = useState<PortalResponse | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

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
            'ÙˆØµÙˆÙ„ Ù…Ø±ÙÙˆØ¶',
            'ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ù‡Ø§ØªÙ Ù…Ø®ØµØµ Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„ÙˆÙ„ÙŠ ÙÙ‚Ø·.'
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
  setIsLoggedIn(false);
}, []);

const fetchMyData = useCallback(async () => {
  setIsLoadingData(true);

  try {
    const token = await AsyncStorage.getItem('token');

    const response = await fetch(`${API_URL}/api/my-portal`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();

    if (!response.ok) {
      Alert.alert('ÙˆØµÙˆÙ„ Ù…Ø±ÙÙˆØ¶', data.error || 'ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ù‡Ø§ØªÙ Ù…Ø®ØµØµ Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„ÙˆÙ„ÙŠ ÙÙ‚Ø·.');
      await handleLogout();
      return;
    }

    setPortalData(data);
  } catch {
    Alert.alert('Error', 'Failed to load your school data.');
  } finally {
    setIsLoadingData(false);
  }
}, [handleLogout]);

useEffect(() => {
  if (isLoggedIn) {
    fetchMyData();
  }
}, [isLoggedIn, fetchMyData]);

  const renderStudentView = (student: StudentPortalShape) => {
    const fullName =
      `${student?.user?.firstName ?? ''} ${student?.user?.lastName ?? ''}`.trim() ||
      'Ø§Ù„Ø§Ø¨Ù†';

    const className = student?.class?.name || 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù‚Ø³Ù…';
    const schedules = student?.class?.schedules ?? [];
    const grades = student?.grades ?? [];
    const attendances = student?.attendances ?? [];
    const absences = attendances.filter((a) => a?.status === 'ABSENT');

    return (
      <View key={student?.id ?? fullName} style={styles.studentSection}>
        <View style={styles.studentHeader}>
          <View style={styles.studentIdentity}>
            <StudentAvatar student={student} />

            <View style={styles.studentTextBlock}>
              <Text style={styles.studentName} numberOfLines={2}>
                {fullName}
              </Text>
              <Text style={styles.profileImageStatus} numberOfLines={1}>
                {student?.user?.profileImage ? 'ØªÙ… Ø±ÙØ¹ Ø§Ù„ØµÙˆØ±Ø©' : 'Ù„Ø§ ØªÙˆØ¬Ø¯ ØµÙˆØ±Ø©'}
              </Text>
            </View>
          </View>

          <View style={styles.classBadge}>
            <Text style={styles.classBadgeText} numberOfLines={2}>
              {className}
            </Text>
          </View>
        </View>

        <SummaryCards grades={grades} attendances={attendances} />

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø£ÙˆÙ‚Ø§Øª Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ÙŠ</Text>
        {!student?.class || schedules.length === 0 ? (
          <Text style={styles.emptyText}>Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­ØµØµ Ù…Ø¨Ø±Ù…Ø¬Ø© Ø¨Ø¹Ø¯.</Text>
        ) : (
          <View style={styles.scheduleContainer}>
            {schedules.map((sched) => {
              const teacherLastName =
                sched?.teacher?.user?.lastName ??
                sched?.teacher?.user?.firstName ??
                'Ø£Ø³ØªØ§Ø°';

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
                    <Text style={styles.subjectName}>{sched?.subject?.name ?? 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù‚Ø³Ù…'}</Text>
                    <Text style={styles.teacherName}>Ø£Ø³ØªØ§Ø° {teacherLastName}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 24 }}>
          <SubjectAverageSection grades={grades} />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Ø¢Ø®Ø± Ø§Ù„Ø£Ø¹Ø¯Ø§Ø¯</Text>
        {grades.length === 0 ? (
          <Text style={styles.emptyText}>Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£Ø¹Ø¯Ø§Ø¯ Ù…Ù†Ø´ÙˆØ±Ø© Ø¨Ø¹Ø¯.</Text>
        ) : (
          grades.map((g) => (
            <View key={g?.id ?? `${g?.subject?.name}-${g?.examType}`} style={styles.gradeCard}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.subjectName}>{g?.subject?.name ?? 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù‚Ø³Ù…'}</Text>
                <Text style={styles.examType}>{translateExamType(g?.examType)}</Text>
                {g?.comments ? <Text style={styles.commentText}>{translateGradeComment(g.comments)}</Text> : null}
              </View>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>{g?.score ?? '-'} /20</Text>
              </View>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Ø§Ù„ØºÙŠØ§Ø¨Ø§Øª</Text>
        {absences.length === 0 ? (
          <Text style={styles.emptyText}>Ù„Ø§ ØªÙˆØ¬Ø¯ ØºÙŠØ§Ø¨Ø§Øª.</Text>
        ) : (
          absences.map((a) => (
            <View key={a?.id ?? `${a?.date}-${a?.status}`} style={styles.absenceCard}>
              <Text style={styles.absenceSubject}>
                {a?.schedule?.subject?.name ?? 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù‚Ø³Ù…'}
              </Text>
              <Text style={styles.absenceDate}>
                {a?.date ? new Date(a.date).toLocaleDateString() : '-'}
              </Text>
            </View>
          ))
        )}

        {attendances.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø­Ø¶ÙˆØ± ÙˆØ§Ù„ØºÙŠØ§Ø¨</Text>
            {attendances.map((a) => (
              <View key={`${a.id}-record`} style={styles.attendanceCard}>
                <Text style={styles.attendanceSubject}>
                  {a?.schedule?.subject?.name ?? 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù‚Ø³Ù…'}
                </Text>
                <Text style={styles.attendanceMeta}>
                  {a?.date ? new Date(a.date).toLocaleDateString() : '-'} â€¢ {translateAttendanceStatus(a.status)}
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
          <Text style={styles.navTitle}>Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„ÙˆÙ„ÙŠ</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutBtnText}>Ø®Ø±ÙˆØ¬</Text>
          </TouchableOpacity>
        </View>

        {isLoadingData || !portalData ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>

            {userRole === 'PARENT' && (
              <View>
                <Text style={styles.parentWelcome}>Ù…Ø±Ø­Ø¨Ø§ Ø¨Ùƒ ÙÙŠ Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„ÙˆÙ„ÙŠ</Text>
                {((portalData as ParentPortalResponse)?.children ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø£Ø¨Ù†Ø§Ø¡ Ù…Ø±ØªØ¨Ø·ÙˆÙ† Ø¨Ø­Ø³Ø§Ø¨ Ù‡Ø°Ø§ Ø§Ù„ÙˆÙ„ÙŠ.</Text>
                ) : (
                  ((portalData as ParentPortalResponse)?.children ?? []).map((child) =>
                    renderStudentView(child)
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
        <Text style={styles.subtitle}>Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„ÙˆÙ„ÙŠ</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ</Text>
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
          <Text style={styles.label}>ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±</Text>
          <TextInput
            style={styles.input}
            placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={isLoggingIn}>
          {isLoggingIn ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Ø¯Ø®ÙˆÙ„</Text>
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

  studentSection: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
    studentHeader: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingBottom: 15,
  },
  studentIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  studentTextBlock: {
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
  studentName: {
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
});

