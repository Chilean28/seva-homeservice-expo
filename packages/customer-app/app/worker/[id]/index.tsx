import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { getInitials } from '@/lib/avatar';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const months = Math.floor((now.getTime() - d.getTime()) / (30 * 24 * 60 * 60 * 1000));
  if (months >= 1) return `${months} month${months > 1 ? 's' : ''} ago`;
  const days = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} day${days > 1 ? 's' : ''} ago`;
  return d.toLocaleDateString();
}

type WorkerDetail = {
  id: string;
  bio: string | null;
  experience_years: number;
  rating_average: number;
  total_jobs_completed: number;
  latitude: number | null;
  longitude: number | null;
  users: { full_name: string; avatar_url: string | null } | null;
  service_subscriptions: Array<{
    service_id: string;
    custom_price: number | null;
    services: { name: string; base_price: number } | null;
  }>;
};

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  users: { full_name: string; avatar_url: string | null } | null;
};

const RATING_CATEGORIES = [
  { label: 'Work quality', key: 'work_quality' },
  { label: 'Reliability', key: 'reliability' },
  { label: 'Punctuality', key: 'punctuality' },
  { label: 'Solution', key: 'solution' },
  { label: 'Payout', key: 'payout' },
];

type SelectedService = { serviceId: string; serviceName: string; price: number };

export default function WorkerDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    serviceId?: string;
    serviceName?: string;
    basePrice?: string;
  }>();
  const { id: workerId, serviceId: paramServiceId, serviceName: paramServiceName, basePrice: paramBasePrice } = params;
  const router = useRouter();
  const [worker, setWorker] = useState<WorkerDetail | null>(null);
  const [selectedService, setSelectedService] = useState<SelectedService | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [portfolioPhotos, setPortfolioPhotos] = useState<{ photo_url: string }[]>([]);
  const [workerLocationName, setWorkerLocationName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());

  const price = selectedService?.price ?? (paramBasePrice ? Number(paramBasePrice) : 0);
  const displayName = worker?.users?.full_name ?? 'Worker';
  const rating = worker ? Number(worker.rating_average) || 0 : 0;
  const jobsCompleted = worker?.total_jobs_completed ?? 0;
  const isTopPro = rating >= 4.5 && jobsCompleted >= 10;

  const fetchWorker = useCallback(async () => {
    if (!workerId) {
      setLoading(false);
      return;
    }
    setError(null);
    const { data, error: err } = await supabase
      .from('worker_profiles')
      .select(
        `
        id,
        bio,
        experience_years,
        rating_average,
        total_jobs_completed,
        latitude,
        longitude,
        users (full_name, avatar_url),
        service_subscriptions (service_id, custom_price, services (name, base_price))
      `
      )
      .eq('id', workerId)
      .maybeSingle();

    if (err) {
      setError(err.message);
      setWorker(null);
    } else {
      setWorker(data as WorkerDetail | null);
      const row = data as WorkerDetail | null;
      if (row?.latitude != null && row?.longitude != null) {
        try {
          const [addr] = await Location.reverseGeocodeAsync({
            latitude: row.latitude,
            longitude: row.longitude,
          });
          if (addr) {
            const parts = [addr.district, addr.subregion, addr.city, addr.region].filter(Boolean) as string[];
            setWorkerLocationName(parts.length ? parts.join(', ') : null);
          } else {
            setWorkerLocationName(null);
          }
        } catch {
          setWorkerLocationName(null);
        }
      } else {
        setWorkerLocationName(null);
      }
    }
  }, [workerId]);

  useEffect(() => {
    if (!worker?.service_subscriptions?.length) return;
    const subs = worker.service_subscriptions;
    if (paramServiceId) {
      const match = subs.find((s) => s.service_id === paramServiceId);
      if (match) {
        const name = match.services?.name ?? 'Service';
        const base = match.services?.base_price ?? 0;
        const p = match.custom_price != null ? Number(match.custom_price) : Number(base);
        setSelectedService({ serviceId: match.service_id, serviceName: name, price: p });
        return;
      }
    }
    if (subs.length === 1) {
      const s = subs[0];
      const name = s.services?.name ?? 'Service';
      const base = s.services?.base_price ?? 0;
      const p = s.custom_price != null ? Number(s.custom_price) : Number(base);
      setSelectedService({ serviceId: s.service_id, serviceName: name, price: p });
    } else {
      setSelectedService(null);
    }
  }, [worker?.id, worker?.service_subscriptions, paramServiceId]);

  const fetchReviews = useCallback(async () => {
    if (!workerId) return;
    const { data } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at, users (full_name, avatar_url)')
      .eq('worker_id', workerId)
      .order('created_at', { ascending: false })
      .limit(10);
    setReviews((data as ReviewRow[]) ?? []);
  }, [workerId]);

  const fetchPortfolio = useCallback(async () => {
    if (!workerId) return;
    const { data } = await supabase
      .from('worker_portfolio_photos')
      .select('photo_url')
      .eq('worker_id', workerId)
      .order('sort_order', { ascending: true });
    setPortfolioPhotos((data as { photo_url: string }[]) ?? []);
  }, [workerId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchWorker();
      await fetchReviews();
      await fetchPortfolio();
      setLoading(false);
    })();
  }, [fetchWorker, fetchReviews, fetchPortfolio]);

  const toggleBio = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBioExpanded((e) => !e);
  }, []);

  const toggleReview = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedReviews((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onBookPress = useCallback(() => {
    const service = selectedService ?? (paramServiceId && paramServiceName && paramBasePrice
      ? { serviceId: paramServiceId, serviceName: paramServiceName, price: Number(paramBasePrice) }
      : null);
    if (!service) return;
    router.push({
      pathname: '/create-booking',
      params: {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        basePrice: String(service.price),
        workerId: workerId ?? undefined,
        workerName: displayName,
      },
    } as Parameters<typeof router.push>[0]);
  }, [router, workerId, selectedService, paramServiceId, paramServiceName, paramBasePrice, displayName]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Taskers Profile</Text>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </View>
    );
  }

  if (error || !worker) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Taskers Profile</Text>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={48} color="#999" />
          <Text style={styles.errorText}>{error ?? 'Worker not found'}</Text>
        </View>
      </View>
    );
  }

  const selectedServiceName = selectedService?.serviceName ?? paramServiceName ?? worker.service_subscriptions?.[0]?.services?.name ?? 'Service';
  const hasMultipleServices = (worker.service_subscriptions?.length ?? 0) > 1;
  const canBook = selectedService != null || (paramServiceId != null && paramServiceName != null && paramBasePrice != null);
  const bio = worker.bio?.trim() ?? '';
  const bioShortLength = 120;
  const showReadMore = bio.length > bioShortLength;
  const bioDisplay = showReadMore && !bioExpanded ? `${bio.slice(0, bioShortLength)}...` : bio;

  const categoryRating = rating;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Taskers Profile</Text>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summarySection}>
          <View style={styles.avatarRow}>
            {worker?.users?.avatar_url ? (
              <Image source={{ uri: worker.users.avatar_url }} style={styles.avatarPlaceholder} />
            ) : (
              <View style={[styles.avatarPlaceholder, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{getInitials(displayName)}</Text>
              </View>
            )}
            {isTopPro && (
              <View style={styles.topProBadge}>
                <Ionicons name="star" size={14} color="#F9A825" />
                <Text style={styles.topProText}>Top pro</Text>
              </View>
            )}
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.serviceLabel}>
            {hasMultipleServices && !canBook ? 'Select a service below' : selectedServiceName}
          </Text>
          <View style={styles.statsRow}>
            {canBook && (
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>${price.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Per hour</Text>
              </View>
            )}
            <View style={styles.statBlock}>
              <View style={styles.statRow}>
                <Ionicons name="star" size={18} color="#34C759" />
                <Text style={styles.statValue}>{rating.toFixed(1)}</Text>
              </View>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statBlock}>
              <View style={styles.statRow}>
                <Ionicons name="time-outline" size={18} color="#000" />
                <Text style={styles.statValue}>2h</Text>
              </View>
              <Text style={styles.statLabel}>Min required</Text>
            </View>
          </View>
        </View>

        {hasMultipleServices && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose a service</Text>
            {worker.service_subscriptions?.map((sub) => {
              const name = sub.services?.name ?? 'Service';
              const base = sub.services?.base_price ?? 0;
              const p = sub.custom_price != null ? Number(sub.custom_price) : Number(base);
              const isSelected = selectedService?.serviceId === sub.service_id;
              return (
                <TouchableOpacity
                  key={sub.service_id}
                  style={[styles.serviceOption, isSelected && styles.serviceOptionSelected]}
                  onPress={() => setSelectedService({ serviceId: sub.service_id, serviceName: name, price: p })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.serviceOptionName}>{name}</Text>
                  <Text style={styles.serviceOptionPrice}>${p.toFixed(2)}/hr</Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={22} color="#34C759" />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {workerLocationName ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>
            <View style={styles.contactRow}>
              <View style={styles.contactItem}>
                <Ionicons name="location-outline" size={20} color="#666" />
                <Text style={styles.contactText}>{workerLocationName}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Experience & Specialities</Text>
          {bio ? (
            <>
              <Text style={styles.bio}>{bioDisplay}</Text>
              {showReadMore && (
                <TouchableOpacity onPress={toggleBio} style={styles.readMoreBtn}>
                  <Text style={styles.readMoreText}>{bioExpanded ? 'Read less' : 'Read More'}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.bioPlaceholder}>No bio provided.</Text>
          )}
        </View>

        {portfolioPhotos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Past work</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.portfolioScroll}>
              {portfolioPhotos.map((p, i) => (
                <Image key={i} source={{ uri: p.photo_url }} style={styles.portfolioImage} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Ratings</Text>
          <View style={styles.ratingSummary}>
            <Text style={styles.ratingBig}>{rating.toFixed(1)}</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Ionicons
                  key={i}
                  name={i <= Math.floor(rating) ? 'star' : i - 0.5 <= rating ? 'star-half' : 'star-outline'}
                  size={22}
                  color="#FFEB3B"
                />
              ))}
            </View>
          </View>
          <Text style={styles.ratingBasedOn}>Based on {reviews.length ? reviews.length : 0} ratings.</Text>
          {RATING_CATEGORIES.map((cat) => (
            <View key={cat.key} style={styles.ratingBarRow}>
              <Text style={styles.ratingBarLabel}>{cat.label}</Text>
              <View style={styles.ratingBarBg}>
                <View style={[styles.ratingBarFill, { width: `${(categoryRating / 5) * 100}%` }]} />
              </View>
              <Text style={styles.ratingBarValue}>{categoryRating.toFixed(1)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.reviewsHeader}>
            <Text style={styles.sectionTitle}>Customer Reviews</Text>
            <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="filter-outline" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          {reviews.length === 0 ? (
            <Text style={styles.noReviews}>No reviews yet.</Text>
          ) : (
            <>
              {reviews.slice(0, 3).map((r) => {
                const isExpanded = expandedReviews.has(r.id);
                const comment = r.comment?.trim() ?? '';
                const showReadMoreReview = comment.length > 100;
                const commentDisplay = showReadMoreReview && !isExpanded ? `${comment.slice(0, 100)}...` : comment;
                return (
                  <View key={r.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      {r.users?.avatar_url ? (
                        <Image source={{ uri: r.users.avatar_url }} style={styles.reviewAvatar} />
                      ) : (
                        <View style={[styles.reviewAvatar, styles.reviewAvatarFallback]}>
                          <Text style={styles.reviewAvatarInitials}>
                            {getInitials(r.users?.full_name ?? 'Customer')}
                          </Text>
                        </View>
                      )}
                      <View style={styles.reviewMeta}>
                        <Text style={styles.reviewerName}>{r.users?.full_name ?? 'Customer'}</Text>
                        <Text style={styles.reviewDate}>{formatReviewDate(r.created_at)}</Text>
                      </View>
                    </View>
                    <View style={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Ionicons
                          key={i}
                          name={i <= r.rating ? 'star' : 'star-outline'}
                          size={14}
                          color="#FFEB3B"
                        />
                      ))}
                    </View>
                    {comment ? (
                      <>
                        <Text style={styles.reviewText}>{commentDisplay}</Text>
                        {showReadMoreReview && (
                          <TouchableOpacity onPress={() => toggleReview(r.id)}>
                            <Text style={styles.readMoreText}>{isExpanded ? 'Read less' : 'Read More'}</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : null}
                  </View>
                );
              })}
              {reviews.length > 3 && (
                <TouchableOpacity style={styles.moreReviewsBtn}>
                  <Text style={styles.moreReviewsText}>More reviews</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.selectButton, !canBook && styles.selectButtonDisabled]}
          onPress={onBookPress}
          activeOpacity={0.8}
          disabled={!canBook}
        >
          <Text style={styles.selectButtonText}>
            {hasMultipleServices && !canBook ? 'Choose a service above' : 'Select'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerWrapper: { backgroundColor: APP_SCREEN_HEADER_BG },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...appScreenHeaderBarPadding,
  },
  backBtn: { padding: 4 },
  headerTitle: { ...appScreenHeaderTitleStyle },
  headerSide: { width: 32 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  centered: {
    flex: 1,
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 12, fontSize: 15, color: '#666' },
  errorText: { marginTop: 12, fontSize: 15, color: '#FF3B30', textAlign: 'center' },

  summarySection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginBottom: 12 },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFEB3B',
    overflow: 'hidden',
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 36, fontWeight: '600', color: '#666' },
  topProBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFF9C4',
    borderRadius: 8,
  },
  topProText: { fontSize: 12, color: '#B8860B', fontWeight: '600' },
  name: { fontSize: 22, fontWeight: '700', color: '#000', marginBottom: 4 },
  serviceLabel: { fontSize: 15, color: '#F9A825', fontWeight: '600', marginBottom: 16 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  statBlock: { alignItems: 'center' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 17, fontWeight: '700', color: '#000' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#000', marginBottom: 12 },
  serviceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  serviceOptionSelected: {
    backgroundColor: '#FFF9C4',
    borderColor: '#F9A825',
  },
  serviceOptionName: { fontSize: 16, fontWeight: '600', color: '#000' },
  serviceOptionPrice: { fontSize: 15, color: '#666' },
  contactRow: { gap: 12 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactLink: { fontSize: 15, color: '#007AFF', fontWeight: '500' },
  contactText: { fontSize: 15, color: '#333', flex: 1 },
  portfolioScroll: { gap: 12, paddingRight: 20 },
  portfolioImage: { width: 160, height: 120, borderRadius: 12, backgroundColor: '#eee' },
  bio: { fontSize: 15, color: '#333', lineHeight: 22 },
  bioPlaceholder: { fontSize: 15, color: '#999', fontStyle: 'italic' },
  readMoreBtn: { marginTop: 6 },
  readMoreText: { fontSize: 15, color: '#F9A825', fontWeight: '600' },

  ratingSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  ratingBig: { fontSize: 28, fontWeight: '700', color: '#000' },
  starsRow: { flexDirection: 'row', gap: 2 },
  ratingBasedOn: { fontSize: 13, color: '#666', marginBottom: 12 },
  ratingBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  ratingBarLabel: { fontSize: 14, color: '#333', width: 90 },
  ratingBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  ratingBarValue: { fontSize: 14, fontWeight: '600', color: '#000', width: 32 },

  reviewsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  noReviews: { fontSize: 15, color: '#999' },
  reviewCard: {
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E0E0',
    marginRight: 10,
    overflow: 'hidden',
  },
  reviewAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  reviewAvatarInitials: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  reviewMeta: {},
  reviewerName: { fontSize: 15, fontWeight: '600', color: '#000' },
  reviewDate: { fontSize: 12, color: '#666', marginTop: 2 },
  reviewStars: { flexDirection: 'row', gap: 2, marginBottom: 6 },
  reviewText: { fontSize: 14, color: '#333', lineHeight: 20 },
  moreReviewsBtn: { marginTop: 8 },
  moreReviewsText: { fontSize: 15, color: '#F9A825', fontWeight: '600' },

  selectButton: {
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F9A825',
    marginTop: 8,
  },
  selectButtonText: { fontSize: 17, fontWeight: '700', color: '#000' },
  selectButtonDisabled: { opacity: 0.6 },
});
